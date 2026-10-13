import { createHash } from "node:crypto";
import sharp from "sharp";
import { CAPTION_MAX_LENGTH, CAPTURE_MAX_BYTES } from "../shared/types.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export function textField(value: unknown, max: number, name: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max)
    throw new ApiError(400, `${name} 값이 올바르지 않습니다.`);
  return value;
}
export function uuid(value: unknown) {
  const result = textField(value, 36, "ID");
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      result,
    )
  )
    throw new ApiError(400, "잘못된 ID입니다.");
  return result;
}
export function captionField(value: unknown): string {
  if (typeof value !== "string" || value.length > CAPTION_MAX_LENGTH)
    throw new ApiError(400, "사진 설명은 1,000자 이내로 입력해 주세요.");
  return value.trim();
}
export async function decodePhoto(value: unknown) {
  const input = textField(value, Math.ceil(CAPTURE_MAX_BYTES / 3) * 4, "사진");
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      input,
    )
  )
    throw new ApiError(400, "잘못된 사진 형식입니다.");
  const bytes = Buffer.from(input, "base64");
  if (!bytes.length || bytes.length > CAPTURE_MAX_BYTES)
    throw new ApiError(413, "사진은 2MB 이하여야 합니다.");
  try {
    const picture = sharp(bytes, {
      limitInputPixels: 25_000_000,
      failOn: "warning",
    });
    const meta = await picture.metadata();
    if (
      meta.format !== "jpeg" ||
      !meta.width ||
      !meta.height ||
      meta.width < 64 ||
      meta.height < 64
    )
      throw new Error("Invalid JPEG");
    // Decode and re-encode to validate pixels and strip EXIF/GPS. Proof binds the original bytes.
    const clean = await picture
      .rotate()
      .resize(1800, 1800, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { clean, hash: sha256(bytes) };
  } catch {
    throw new ApiError(400, "사진을 읽을 수 없습니다. 다시 촬영해 주세요.");
  }
}
export interface AndroidVerdict {
  requestDetails?: {
    requestPackageName?: string;
    requestHash?: string;
    timestampMillis?: string;
  };
  appIntegrity?: {
    appRecognitionVerdict?: string;
    packageName?: string;
    certificateSha256Digest?: string[];
  };
  deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
  accountDetails?: { appLicensingVerdict?: string };
}
export function validateAndroidVerdict(
  verdict: AndroidVerdict,
  hash: string,
  packageName: string,
  certificates: string[],
  now = Date.now(),
) {
  const request = verdict.requestDetails;
  const timestamp = Number(request?.timestampMillis);
  const valid =
    request?.requestPackageName === packageName &&
    request.requestHash === hash &&
    Number.isFinite(timestamp) &&
    now - timestamp <= 180_000 &&
    timestamp <= now + 10_000 &&
    verdict.appIntegrity?.appRecognitionVerdict === "PLAY_RECOGNIZED" &&
    verdict.appIntegrity.packageName === packageName &&
    verdict.appIntegrity.certificateSha256Digest?.some((c) =>
      certificates.includes(c),
    ) &&
    verdict.deviceIntegrity?.deviceRecognitionVerdict?.includes(
      "MEETS_DEVICE_INTEGRITY",
    ) &&
    verdict.accountDetails?.appLicensingVerdict === "LICENSED";
  if (!valid)
    throw new ApiError(
      403,
      "공식 앱과 기기를 확인할 수 없습니다. 공식 배포본에서 다시 시도해 주세요.",
    );
}
