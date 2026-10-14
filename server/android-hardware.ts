import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { ANDROID_HARDWARE_CHALLENGE_PREFIX } from "../shared/types.js";
import { ApiError, sha256 } from "./validation.js";

const unavailable = () => new ApiError(503, "기기 인증에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.");
const invalid = () => new ApiError(403, "공식 앱과 안전한 기기를 확인할 수 없습니다. 공식 배포본에서 다시 촬영해 주세요.");
const REVOCATIONS_URL = "https://android.googleapis.com/attestation/status";
const MAX_REVOCATION_BYTES = 4 * 1024 * 1024;
const MAX_CACHE_MS = 60 * 60 * 1000;

export interface HardwareConfig {
  packageName: string;
  minVersion: string;
  signerDigests: string[];
}
export function hardwareConfig(env: NodeJS.ProcessEnv = process.env): HardwareConfig {
  const signerDigests = (env.ANDROID_HARDWARE_CERT_SHA256 ?? "").split(",").map(s => s.trim().toLowerCase());
  const minVersion = env.ANDROID_HARDWARE_MIN_VERSION ?? "";
  if (env.ANDROID_HARDWARE_ATTESTATION_ENABLED !== "true" || env.ANDROID_PACKAGE_NAME !== "com.nepeel.app" ||
      !/^[1-9][0-9]{0,9}$/.test(minVersion) || signerDigests.length > 4 ||
      signerDigests.some(s => !/^[0-9a-f]{64}$/.test(s))) throw unavailable();
  return { packageName: env.ANDROID_PACKAGE_NAME, minVersion, signerDigests };
}

export function certificateChain(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > 6) throw invalid();
  return value.map(item => {
    if (typeof item !== "string" || item.length < 100 || item.length > 16_384 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(item) || Buffer.from(item, "base64").toString("base64") !== item) throw invalid();
    return item;
  });
}

export function parseRevocations(value: unknown): string[] {
  if (!value || typeof value !== "object" || !("entries" in value)) throw unavailable();
  const entries = value.entries;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) throw unavailable();
  const pairs = Object.entries(entries);
  if (pairs.length > 100_000) throw unavailable();
  return pairs.map(([serial, details]) => {
    if (!/^[0-9a-fA-F]{1,80}$/.test(serial) || !details || typeof details !== "object" ||
        !("status" in details) || typeof details.status !== "string" || !details.status) throw unavailable();
    // The list contains unavailable keys. Reject SUSPENDED and unknown future statuses too.
    return BigInt(`0x${serial}`).toString(16);
  });
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) throw unavailable();
  const reader = response.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_REVOCATION_BYTES) throw unavailable();
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel().catch(() => undefined); }
}

export function createRevocationSource(fetcher: typeof fetch = fetch, now = Date.now) {
  let cache: { serials: string[]; expires: number } | undefined;
  let pending: Promise<string[]> | undefined;
  let retryAt = 0;
  return async (): Promise<string[]> => {
    if (cache && cache.expires > now()) return cache.serials;
    if (pending) return pending;
    if (retryAt > now()) throw unavailable();
    pending = (async () => {
      try {
        const started = now();
        const response = await fetcher(REVOCATIONS_URL, { signal: AbortSignal.timeout(8_000), redirect: "error" });
        const serials = parseRevocations(await boundedJson(response));
        const control = response.headers.get("cache-control") ?? "";
        const match = /(?:^|,)\s*max-age=(\d+)(?:\s*,|\s*$)/i.exec(control);
        const maxAge = match ? Number(match[1]) * 1000 : MAX_CACHE_MS;
        const age = Number(response.headers.get("age") ?? "0") * 1000;
        const dated = Date.parse(response.headers.get("date") ?? "");
        const elapsed = Math.max(age, Number.isFinite(dated) ? started - dated : 0, 0);
        if (!Number.isFinite(maxAge) || !Number.isFinite(age) || age < 0 || elapsed > maxAge) throw unavailable();
        const ttl = /\bno-store\b|\bno-cache\b/i.test(control) ? 0 : Math.min(MAX_CACHE_MS, maxAge - elapsed);
        cache = { serials, expires: started + ttl };
        return serials;
      } catch {
        retryAt = now() + 5_000;
        throw unavailable();
      } finally { pending = undefined; }
    })();
    return pending;
  };
}

export interface HardwareInput extends HardwareConfig {
  chain: string[];
  challenge: string;
  revokedSerials: string[];
}
let workers = 0;
export async function runHardwareVerifier(input: HardwareInput): Promise<void> {
  if (workers >= 2) throw new ApiError(429, "인증 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
  workers++;
  try {
    const runtime = path.resolve(".attestation-runtime");
    const manifest = JSON.parse(await readFile(path.join(runtime, "classpath.json"), "utf8")) as { java: string; jars: string[] };
    if (!Array.isArray(manifest.jars) || !manifest.jars.length || manifest.jars.some(p =>
      typeof p !== "string" || !/^lib\/[a-f0-9]{64}\/[\w.+-]+\.jar$/.test(p))) throw unavailable();
    if (process.platform !== "win32" && manifest.java !== "java/bin/java") throw unavailable();
    if (typeof manifest.java !== "string") throw unavailable();
    const executable = path.resolve(runtime, manifest.java);
    const classpath = manifest.jars.map(p => path.join(runtime, p)).join(path.delimiter);
    const json = JSON.stringify(input);
    if (Buffer.byteLength(json) > MAX_REVOCATION_BYTES) throw unavailable();
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = execFile(executable, ["-Xms16m", "-Xmx96m", "-XX:MaxMetaspaceSize=64m", "-XX:+UseSerialGC",
        "-XX:ActiveProcessorCount=1", "-Djava.io.tmpdir=" + tmpdir(), "-cp", classpath, "com.nepeel.attestation.MainKt"], {
        timeout: 15_000, killSignal: "SIGKILL", maxBuffer: 4096, windowsHide: true,
        // Never inherit Supabase credentials, user tokens, JVM flags or other server secrets.
        env: { LANG: "C.UTF-8", TMPDIR: tmpdir(), ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {}) },
      }, (error, output) => error ? reject(unavailable()) : resolve(output));
      child.stdin?.on("error", () => reject(unavailable()));
      child.stdin?.end(json);
    });
    const verdict = JSON.parse(stdout);
    if (verdict.ok === false) throw invalid();
    if (verdict.ok !== true || !["TRUSTED_ENVIRONMENT", "STRONG_BOX"].includes(verdict.securityLevel)) throw unavailable();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unavailable();
  } finally { workers--; }
}

const getRevocations = createRevocationSource();
export function createHardwareVerifier(dependencies = { config: hardwareConfig, revocations: getRevocations, run: runHardwareVerifier }) {
  return async (chain: unknown, payload: string): Promise<void> => {
    const config = dependencies.config();
    const parsed = certificateChain(chain);
    const revokedSerials = await dependencies.revocations();
    await dependencies.run({ ...config, chain: parsed, revokedSerials,
      challenge: ANDROID_HARDWARE_CHALLENGE_PREFIX + sha256(payload) });
  };
}
export const androidHardwareIntegrity = createHardwareVerifier();
