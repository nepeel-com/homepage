import type { SupabaseClient } from "@supabase/supabase-js";
import { capturePayload } from "../shared/types.js";
import { androidCaptureProof, iosAssertion } from "./integrity.js";
import {
  ApiError,
  captionField,
  decodePhoto,
  textField,
  uuid,
} from "./validation.js";
import {
  contextPayload,
  normalizeCaptureContext,
  type CaptureContext,
} from "../shared/capture-context.js";
import { applyPhotoFilter } from "./photo-filter.js";

interface Publication {
  challenge_id: string;
  user_id: string;
  post_id: string;
  image_path: string;
  image_sha256: string;
  caption: string;
  platform: string;
  state: "pending" | "published" | "abandoned";
  expires_at: string;
  context: CaptureContext | null;
}
type Counter =
  { p_key: string; p_previous: number; p_next: number } | undefined;
type VerifyProof = (
  client: SupabaseClient,
  userId: string,
  proof: Record<string, unknown>,
  payload: string,
) => Promise<Counter>;

const verifyProof: VerifyProof = async (client, userId, proof, payload) => {
  if (proof.platform === "android") {
    await androidCaptureProof(proof, payload);
    return;
  }
  const keyId = textField(proof.keyId, 512, "기기 키");
  const assertion = textField(proof.assertion, 10_000, "촬영 인증");
  const { data: key, error } = await client
    .from("device_keys")
    .select("*")
    .eq("key_id", keyId)
    .eq("user_id", userId)
    .single();
  if (error || !key) throw new ApiError(403, "등록되지 않은 기기입니다.");
  if (
    key.environment !== "production" &&
    process.env.APP_ATTEST_ENVIRONMENT !== "development"
  )
    throw new ApiError(403, "테스트용 앱으로는 게시할 수 없습니다.");
  const verified = iosAssertion(
    assertion,
    payload,
    key.public_key,
    Number(key.sign_count),
  );
  return {
    p_key: keyId,
    p_previous: Number(key.sign_count),
    p_next: verified.signCount,
  };
};
const retryError = () =>
  new ApiError(
    503,
    "게시 결과를 확인하지 못했어요. 같은 사진으로 다시 시도해 주세요.",
  );

export async function publishPhoto(
  client: SupabaseClient,
  userId: string,
  body: Record<string, unknown>,
  verify: VerifyProof = verifyProof,
): Promise<{ id: string }> {
  const challengeId = uuid(body.challengeId);
  const proof = body.proof as Record<string, unknown> | undefined;
  if (!proof || (proof.platform !== "ios" && proof.platform !== "android"))
    throw new ApiError(403, "공식 nepeel 앱에서 촬영해 주세요.");
  const caption = captionField(body.caption);
  let context: CaptureContext | undefined;
  if (body.context !== undefined) {
    try {
      context = normalizeCaptureContext(body.context);
    } catch {
      throw new ApiError(400, "촬영 장소 또는 필터 설정을 확인해 주세요.");
    }
  }
  const { clean, hash } = await decodePhoto(body.imageBase64);
  const { data, error } = await client
    .from("capture_publications")
    .select("*")
    .eq("challenge_id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw retryError();
  let receipt = data as Publication | null;
  if (!receipt) {
    const { data: attempts, error: attemptError } = await client.rpc(
      "begin_capture_attempt",
      {
        p_id: challengeId,
        p_user: userId,
        p_purpose: "capture",
      },
    );
    const challenge = attempts?.[0];
    if (attemptError || !challenge) {
      // Another identical request may have reserved the receipt after our read.
      const recovery = await client
        .from("capture_publications")
        .select("*")
        .eq("challenge_id", challengeId)
        .eq("user_id", userId)
        .maybeSingle();
      if (recovery.error) throw retryError();
      receipt = recovery.data;
      if (!receipt)
        throw new ApiError(
          409,
          "촬영이 만료되었거나 요청 횟수를 초과했습니다. 다시 촬영해 주세요.",
        );
    } else {
      const counter = await verify(
        client,
        userId,
        proof,
        capturePayload(userId, challenge, hash, caption, context),
      );
      const reserved = await client.rpc("reserve_capture_publication", {
        p_id: challengeId,
        p_user: userId,
        p_hash: hash,
        p_caption: caption,
        p_platform: proof.platform,
        p_context: context ?? null,
        ...counter,
      });
      if (reserved.error || !reserved.data?.[0]) throw retryError();
      receipt = reserved.data[0];
    }
  }
  if (!receipt) throw retryError();
  if (
    receipt.user_id !== userId ||
    receipt.image_sha256 !== hash ||
    receipt.caption !== caption ||
    receipt.platform !== proof.platform ||
    JSON.stringify(receipt.context ? contextPayload(receipt.context) : null) !==
      JSON.stringify(context ? contextPayload(context) : null)
  )
    throw new ApiError(
      409,
      "게시를 시작한 사진과 설명은 변경할 수 없어요. 같은 내용으로 다시 시도해 주세요.",
    );
  if (receipt.state === "published") return { id: receipt.post_id };
  if (
    receipt.state !== "pending" ||
    Date.parse(receipt.expires_at) <= Date.now()
  )
    throw new ApiError(
      410,
      "이 촬영의 게시가 종료됐어요. 새로운 순간을 촬영해 주세요.",
    );

  // Immutable path: concurrent retries can upload identical verified bytes only.
  const rendered = await applyPhotoFilter(clean, context?.filter ?? "original");
  const uploaded = await client.storage
    .from("captures")
    .upload(receipt.image_path, rendered, {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (uploaded.error) {
    const code =
      "code" in uploaded.error && uploaded.error.code
        ? String(uploaded.error.code)
        : String(uploaded.error.statusCode ?? "");
    if (
      ![
        "409",
        "ResourceAlreadyExists",
        "KeyAlreadyExists",
        "already_exists",
      ].includes(code)
    )
      throw retryError();
  }
  const finished = await client.rpc("finish_capture_publication", {
    p_id: challengeId,
    p_user: userId,
  });
  // Never delete an object after an ambiguous DB response: commit may have succeeded.
  // Expired/deleted receipts enqueue their own durable cleanup in the database.
  if (finished.error || finished.data !== receipt.post_id) throw retryError();
  return { id: receipt.post_id };
}
