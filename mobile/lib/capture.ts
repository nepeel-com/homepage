import { Platform } from "react-native";
import * as AppIntegrity from "@expo/app-integrity";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { supabase } from "./supabase";
import {
  ANDROID_HARDWARE_CHALLENGE_PREFIX,
  CAPTURE_MAX_BYTES,
  capturePayload,
} from "../../shared/types";
import type {
  CaptureProof,
  CaptureRequest,
  Challenge,
} from "../../shared/types";
import {
  normalizeCaptureContext,
  type CaptureContext,
} from "../../shared/capture-context";

export class CaptureApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function captureApi<T>(
  body: object,
  expectedUserId?: string,
): Promise<T> {
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base?.startsWith("https://"))
    throw new Error(
      "촬영 서버 연결을 준비 중입니다. HTTPS 서버 주소를 설정해 주세요.",
    );
  if (!supabase) throw new Error("계정 연결을 확인해 주세요.");
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (
    error ||
    !session ||
    (expectedUserId && session.user.id !== expectedUserId)
  )
    throw new CaptureApiError(401, "다시 로그인해 주세요.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/api/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok)
      throw new CaptureApiError(
        response.status,
        result.error || "촬영 인증을 완료하지 못했습니다.",
      );
    return result;
  } catch (error) {
    if (error instanceof CaptureApiError) throw error;
    throw new Error(
      "서버 응답을 확인하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
let androidPrepared = false;
export async function prepareCamera(userId: string): Promise<string | null> {
  if (Platform.OS === "ios") {
    if (!AppIntegrity.isSupported)
      throw new Error(
        "이 기기는 촬영 인증을 지원하지 않습니다. 실제 iPhone의 공식 앱에서 촬영해 주세요.",
      );
    const storageKey = `nepeel-attest-${userId}`;
    const stored = await SecureStore.getItemAsync(storageKey);
    if (stored) return stored;
    const challenge = await captureApi<Challenge>({
      action: "challenge",
      purpose: "register",
    });
    const keyId = await AppIntegrity.generateKeyAsync();
    const attestation = await AppIntegrity.attestKeyAsync(
      keyId,
      challenge.nonce,
    );
    await captureApi({
      action: "register",
      challengeId: challenge.id,
      keyId,
      attestation,
    });
    await SecureStore.setItemAsync(storageKey, keyId);
    return keyId;
  }
  if (Platform.OS === "android") {
    if (process.env.EXPO_PUBLIC_ANDROID_ATTESTATION === "hardware") {
      if (!(await AppIntegrity.isHardwareAttestationSupportedAsync()))
        throw new Error("이 Android 기기는 촬영 인증을 지원하지 않습니다.");
      return null;
    }
    const project = process.env.EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER;
    if (!project) throw new Error("Android 앱 인증 연결을 준비 중입니다.");
    if (!androidPrepared) {
      await AppIntegrity.prepareIntegrityTokenProviderAsync(project);
      androidPrepared = true;
    }
    return null;
  }
  throw new Error("사진 게시는 iOS·Android 공식 앱에서만 가능합니다.");
}
export async function prepareCaptureRequest(
  userId: string,
  challenge: Challenge,
  uri: string,
  caption: string,
  keyId: string | null,
  selectedContext: CaptureContext,
): Promise<CaptureRequest> {
  if (Date.parse(challenge.expires_at) <= Date.now())
    throw new Error("촬영 시간이 만료됐어요. 다시 촬영해 주세요.");
  const file = new File(uri);
  if (!file.exists || file.size > CAPTURE_MAX_BYTES)
    throw new Error("사진은 2MB 이하여야 합니다. 다시 촬영해 주세요.");
  const bytes = await file.arrayBuffer();
  const digest = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    bytes,
  );
  const hash = Array.from(new Uint8Array(digest))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const cleanCaption = caption.trim();
  const context = normalizeCaptureContext(selectedContext);
  const payload = capturePayload(
    userId,
    challenge,
    hash,
    cleanCaption,
    context,
  );
  let proof: CaptureProof;
  if (Platform.OS === "ios" && keyId) {
    proof = {
      platform: "ios",
      keyId,
      assertion: await AppIntegrity.generateAssertionAsync(keyId, payload),
    };
  } else if (Platform.OS === "android") {
    const requestHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      payload,
    );
    if (process.env.EXPO_PUBLIC_ANDROID_ATTESTATION === "hardware") {
      // A fresh key binds this exact account, nonce, image and caption. Reuse only the alias.
      const alias = "nepeel.capture.v1";
      try {
        await AppIntegrity.generateHardwareAttestedKeyAsync(
          alias,
          ANDROID_HARDWARE_CHALLENGE_PREFIX + requestHash,
        );
        const chain =
          await AppIntegrity.getAttestationCertificateChainAsync(alias);
        proof = { platform: "android", kind: "hardware", chain };
      } catch {
        throw new Error(
          "기기 촬영 인증을 만들지 못했습니다. 휴대폰의 보안 업데이트와 인터넷 연결을 확인한 뒤 다시 시도해 주세요.",
        );
      }
    } else {
      let token: string;
      try {
        token = await AppIntegrity.requestIntegrityCheckAsync(requestHash);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ERR_APP_INTEGRITY_PROVIDER_INVALID"
        ) {
          androidPrepared = false;
          await prepareCamera(userId);
          token = await AppIntegrity.requestIntegrityCheckAsync(requestHash);
        } else throw error;
      }
      proof = { platform: "android", token };
    }
  } else throw new Error("공식 앱에서 다시 촬영해 주세요.");
  return {
    action: "publish",
    challengeId: challenge.id,
    caption: cleanCaption,
    imageBase64: await file.base64(),
    proof,
    context,
  };
}
export function discardPhoto(uri?: string) {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    /* Cache is also cleared by the OS. */
  }
}
