import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { cleanupMedia, deleteAccount } from "./account.js";
import { ApiError, textField, uuid } from "../server/validation.js";
import { iosRegistration } from "../server/integrity.js";
import { required } from "./env.js";
import { publishPhoto } from "./publication.js";

export interface CaptureRequest {
  method?: string;
  headers: { authorization?: string };
  body: unknown;
}
export interface CaptureResponse {
  setHeader(name: string, value: string): unknown;
  status(code: number): CaptureResponse;
  json(value: unknown): unknown;
}
export default async function handler(
  req: CaptureRequest,
  res: CaptureResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST 요청만 가능합니다." });
  }
  try {
    const bearer = req.headers.authorization;
    if (!bearer?.startsWith("Bearer "))
      throw new ApiError(401, "로그인이 필요합니다.");
    const requestDeadline = AbortSignal.timeout(55_000);
    const client = createClient(
      required("SUPABASE_URL"),
      required("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              signal: AbortSignal.any([
                requestDeadline,
                AbortSignal.timeout(20_000),
                ...(init?.signal ? [init.signal] : []),
              ]),
            }),
        },
      },
    );
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser(bearer.slice(7));
    if (authError || !user)
      throw new ApiError(401, "로그인이 만료되었습니다. 다시 로그인해 주세요.");
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : (req.body as Record<string, unknown>);
    if (!body || typeof body !== "object")
      throw new ApiError(400, "잘못된 요청입니다.");
    if (body.action === "deleteAccount")
      return res.status(200).json(await deleteAccount(client, user, body));
    if (body.action === "challenge") {
      if (body.purpose !== "capture" && body.purpose !== "register")
        throw new ApiError(400, "잘못된 인증 요청입니다.");
      const { data, error } = await client.rpc("issue_challenge", {
        p_user: user.id,
        p_nonce: randomBytes(32).toString("base64url"),
        p_purpose: body.purpose,
      });
      if (error)
        throw new ApiError(
          error.message.includes("Too many") ? 429 : 500,
          error.message.includes("Too many")
            ? "촬영 요청이 많습니다. 10분 뒤 다시 시도해 주세요."
            : "촬영을 시작할 수 없습니다.",
        );
      const { id, nonce, expires_at } = data[0];
      return res.status(200).json({ id, nonce, expires_at });
    }
    if (body.action === "delete") {
      const id = uuid(body.postId);
      const { data: post } = await client
        .from("posts")
        .select("image_path")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();
      if (!post) throw new ApiError(404, "게시물을 찾을 수 없습니다.");
      const { error } = await client
        .from("posts")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw new ApiError(500, "게시물을 삭제할 수 없습니다.");
      try {
        await cleanupMedia(client, user.id);
      } catch {
        console.error("capture_storage_cleanup_queued", id);
      }
      return res.status(200).json({ deleted: true });
    }
    if (body.action !== "publish" && body.action !== "register")
      throw new ApiError(400, "지원하지 않는 요청입니다.");
    if (body.action === "publish")
      return res.status(201).json(await publishPhoto(client, user.id, body));
    const challengeId = uuid(body.challengeId);
    const { data: attempts, error: attemptError } = await client.rpc(
      "begin_capture_attempt",
      { p_id: challengeId, p_user: user.id, p_purpose: "register" },
    );
    const challenge = attempts?.[0];
    if (attemptError || !challenge)
      throw new ApiError(
        409,
        "촬영이 만료되었거나 요청 횟수를 초과했습니다. 다시 촬영해 주세요.",
      );
    const keyId = textField(body.keyId, 512, "기기 키");
    const attestation = textField(body.attestation, 30_000, "앱 인증");
    const verified = iosRegistration(attestation, keyId, challenge.nonce);
    const { error } = await client.rpc("register_device", {
      p_id: challengeId,
      p_user: user.id,
      p_key: keyId,
      p_public_key: verified.publicKey,
      p_environment: verified.environment,
    });
    if (error)
      throw new ApiError(
        409,
        "기기 등록이 만료되었습니다. 다시 시도해 주세요.",
      );
    return res.status(200).json({ registered: true });
  } catch (error) {
    if (error instanceof ApiError)
      return res.status(error.status).json({ error: error.message });
    console.error(
      "capture_request_failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return res.status(500).json({
      error: "요청을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    });
  }
}
