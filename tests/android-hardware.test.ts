import { test } from "node:test";
import assert from "node:assert/strict";
import { certificateChain, createHardwareVerifier, createRevocationSource, hardwareConfig, parseRevocations, type HardwareInput } from "../server/android-hardware.js";
import { androidCaptureProof } from "../server/integrity.js";
import { ApiError, sha256 } from "../server/validation.js";
import { ANDROID_HARDWARE_CHALLENGE_PREFIX, capturePayload } from "../shared/types.js";

const env = { ANDROID_HARDWARE_ATTESTATION_ENABLED: "true", ANDROID_PACKAGE_NAME: "com.nepeel.app",
  ANDROID_HARDWARE_MIN_VERSION: "2", ANDROID_HARDWARE_CERT_SHA256: "42".repeat(32) };
const chain = Array(3).fill(Buffer.alloc(100, 1).toString("base64"));
const status = (code: number) => (error: unknown) => error instanceof ApiError && error.status === code;
const response = (body: unknown = { entries: { "000AF": { status: "REVOKED" } } }, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { headers: { "cache-control": "max-age=3600", ...headers } });

test("hardware capture requires explicit enablement, package, signer and minimum version", () => {
  assert.equal(hardwareConfig(env).minVersion, "2");
  for (const [key, value] of Object.entries({ ANDROID_HARDWARE_ATTESTATION_ENABLED: "false", ANDROID_PACKAGE_NAME: "other",
    ANDROID_HARDWARE_MIN_VERSION: "0", ANDROID_HARDWARE_CERT_SHA256: "" })) {
    assert.throws(() => hardwareConfig({ ...env, [key]: value }), status(503));
  }
  assert.throws(() => hardwareConfig({ ...env, ANDROID_HARDWARE_CERT_SHA256: Array(5).fill(env.ANDROID_HARDWARE_CERT_SHA256).join(",") }), status(503));
});

test("hardware proof rejects malformed bounds and mixed protocols before provider work", async () => {
  assert.deepEqual(certificateChain(chain), chain);
  for (const input of [null, {}, chain.slice(1), [...chain, ...chain, ...chain], ["not-base64", ...chain.slice(1)],
    ["a".repeat(16_388), ...chain.slice(1)], [chain[0].slice(0, -1), ...chain.slice(1)]])
    assert.throws(() => certificateChain(input), status(403));
  for (const proof of [{ platform: "android", kind: "hardware", chain, token: "mixed" },
    { platform: "android", kind: "unknown", token: "x" }, { platform: "android", token: "x", chain }])
    await assert.rejects(androidCaptureProof(proof, "payload"), status(403));
});

test("revoked suspended and unknown statuses all reject listed certificate serials", () => {
  assert.deepEqual(parseRevocations({ entries: { "000AF": { status: "REVOKED" }, "10": { status: "SUSPENDED" }, "0b": { status: "FUTURE_STATUS" } } }), ["10", "af", "b"]);
  for (const input of [null, {}, { entries: [] }, { entries: { nope: { status: "REVOKED" } } }, { entries: { a: {} } }])
    assert.throws(() => parseRevocations(input), status(503));
});

test("revocation refresh coalesces and respects origin cache age with a one-hour ceiling", async () => {
  let now = 0, calls = 0;
  const source = createRevocationSource(async (url, options) => {
    calls++;
    assert.equal(url, "https://android.googleapis.com/attestation/status");
    assert.equal(options?.redirect, "error");
    return response(undefined, { "cache-control": "public, max-age=86400", age: "86000" });
  }, () => now);
  assert.deepEqual(await Promise.all([source(), source(), source()]), [["af"], ["af"], ["af"]]);
  assert.equal(calls, 1);
  now = 399_999; await source(); assert.equal(calls, 1);
  now = 400_001; await source(); assert.equal(calls, 2);
  let cappedCalls = 0;
  const capped = createRevocationSource(async () => { cappedCalls++; return response(undefined, { "cache-control": "max-age=86400" }); }, () => now);
  await capped(); now += 3_600_001; await capped(); assert.equal(cappedCalls, 2);
});

test("stale data is never used when refresh fails; failures cool down and can recover", async () => {
  let now = 0, calls = 0, fail = false;
  const source = createRevocationSource(async () => {
    calls++;
    if (fail) throw new Error("network down");
    return response(undefined, { "cache-control": "max-age=1" });
  }, () => now);
  await source(); now = 1001; fail = true;
  await assert.rejects(source(), status(503));
  await assert.rejects(source(), status(503)); assert.equal(calls, 2);
  now += 5001; fail = false; assert.deepEqual(await source(), ["af"]); assert.equal(calls, 3);
});

test("HTTP errors stale origin malformed or oversized revocation data fail closed", async () => {
  const sources = [
    () => new Response("no", { status: 503 }), () => new Response("invalid JSON"),
    () => new Response("x".repeat(4 * 1024 * 1024 + 1)), () => response({}),
    () => response(undefined, { "cache-control": "max-age=1", age: "2" }),
    () => response(undefined, { "cache-control": "max-age=3600", date: new Date(0).toUTCString() }),
  ];
  for (const get of sources) await assert.rejects(createRevocationSource(async () => get(), () => 4_000_000)(), status(503));
});

test("hardware verifier derives challenge on server and binds account nonce photo caption", async () => {
  const seen: HardwareInput[] = [];
  const verify = createHardwareVerifier({ config: () => hardwareConfig(env), revocations: async () => ["af"], run: async input => { seen.push(input); } });
  const challenge = { id: "capture-id", nonce: "random", expires_at: "" };
  const payloads = [capturePayload("alice", challenge, "image", "caption"), capturePayload("bob", challenge, "image", "caption"),
    capturePayload("alice", { ...challenge, nonce: "changed" }, "image", "caption"),
    capturePayload("alice", challenge, "changed", "caption"), capturePayload("alice", challenge, "image", "changed")];
  for (const payload of payloads) await verify(chain, payload);
  assert.equal(new Set(seen.map(input => input.challenge)).size, payloads.length);
  assert.equal(seen[0].challenge, ANDROID_HARDWARE_CHALLENGE_PREFIX + sha256(payloads[0]));
  assert.deepEqual(seen[0].revokedSerials, ["af"]);
  assert.equal(seen[0].packageName, "com.nepeel.app");
  let runs = 0;
  const unavailableSource = createHardwareVerifier({ config: () => hardwareConfig(env), revocations: async () => { throw new ApiError(503, "offline"); }, run: async () => { runs++; } });
  await assert.rejects(unavailableSource(chain, payloads[0]), status(503)); assert.equal(runs, 0);
});
