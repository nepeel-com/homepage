import { importPKCS8, SignJWT } from "jose";
import { verifyAssertion, verifyAttestation } from "node-app-attest";
import cbor from "cbor";
import { X509Certificate } from "node:crypto";
import { ApiError, sha256, validateAndroidVerdict } from "./validation.js";
import { androidHardwareIntegrity } from "./android-hardware.js";
import { textField } from "./validation.js";
import { required } from "./env.js";

export async function androidCaptureProof(proof: Record<string, unknown>, payload: string) {
  const keys = Object.keys(proof).sort().join(",");
  if (proof.kind === "hardware" && keys === "chain,kind,platform")
    return androidHardwareIntegrity(proof.chain, payload);
  if (proof.kind === undefined && keys === "platform,token")
    return androidIntegrity(textField(proof.token, 30_000, "촬영 인증"), payload);
  throw new ApiError(403, "공식 앱에서 다시 촬영해 주세요.");
}

export function iosRegistration(
  attestation: string,
  keyId: string,
  challenge: string,
) {
  const bundleIdentifier = required("IOS_BUNDLE_ID");
  const teamIdentifier = required("APPLE_TEAM_ID");
  try {
    const buffer = Buffer.from(attestation, "base64");
    const verified = verifyAttestation({
      attestation: buffer,
      keyId,
      challenge,
      bundleIdentifier,
      teamIdentifier,
      allowDevelopmentEnvironment:
        process.env.APP_ATTEST_ENVIRONMENT === "development",
    });
    // The upstream verifier checks chain signatures, but not certificate dates.
    const decoded = cbor.decodeFirstSync(buffer);
    const now = Date.now();
    for (const raw of decoded.attStmt.x5c) {
      const cert = new X509Certificate(raw);
      if (now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo))
        throw new Error("Expired attestation certificate");
    }
    return verified;
  } catch {
    throw new ApiError(403, "공식 iOS 앱을 확인할 수 없습니다.");
  }
}
export function iosAssertion(
  assertion: string,
  payload: string,
  publicKey: string,
  signCount: number,
) {
  const bundleIdentifier = required("IOS_BUNDLE_ID");
  const teamIdentifier = required("APPLE_TEAM_ID");
  try {
    return verifyAssertion({
      assertion: Buffer.from(assertion, "base64"),
      payload,
      publicKey,
      bundleIdentifier,
      teamIdentifier,
      signCount,
    });
  } catch {
    throw new ApiError(
      403,
      "촬영 인증이 일치하지 않습니다. 다시 촬영해 주세요.",
    );
  }
}
let cachedToken: { value: string; expires: number } | undefined;
async function googleAccessToken() {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000)
    return cachedToken.value;
  const credential = JSON.parse(required("GOOGLE_SERVICE_ACCOUNT_JSON")) as {
    client_email: string;
    private_key: string;
  };
  const key = await importPKCS8(credential.private_key, "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/playintegrity",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(credential.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new ApiError(503, "기기 인증 서버에 연결할 수 없습니다.");
  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    value: data.access_token,
    expires: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}
export async function androidIntegrity(token: string, payload: string) {
  const packageName = required("ANDROID_PACKAGE_NAME");
  const certificates = required("ANDROID_CERTIFICATE_SHA256")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const access = await googleAccessToken();
  const response = await fetch(
    `https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ integrity_token: token }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok)
    throw new ApiError(
      403,
      "Android 앱 인증에 실패했습니다. 다시 촬영해 주세요.",
    );
  const result = await response.json();
  validateAndroidVerdict(
    result.tokenPayloadExternal ?? {},
    sha256(payload),
    packageName,
    certificates,
  );
}
