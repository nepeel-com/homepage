import { test } from "node:test";
import assert from "node:assert/strict";
import capture from "../netlify/functions/capture.js";
test("portable capture endpoint rejects non-POST, malformed JSON, oversize and unauthenticated requests", async () => {
  const method = await capture(new Request("https://example.com/api/capture"));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "POST");
  const malformed = await capture(
    new Request("https://example.com/api/capture", {
      method: "POST",
      body: "invalid",
    }),
  );
  assert.equal(malformed.status, 400);
  const large = await capture(
    new Request("https://example.com/api/capture", {
      method: "POST",
      body: "a".repeat(3_000_001),
    }),
  );
  assert.equal(large.status, 413);
  const unauthorized = await capture(
    new Request("https://example.com/api/capture", {
      method: "POST",
      body: '{"action":"publish"}',
    }),
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get("cache-control"), "no-store");
});
