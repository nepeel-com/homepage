import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { authError, authRedirect, performAuth, validateAuth } from "../shared/auth";

const fields = { email: " member@example.test ", name: " Member ", password: "local-fixture-password" };
function backend(response: object = {}, status = 200) {
  const requests: { url: URL; body: Record<string, unknown> }[] = [];
  const client = createClient("https://local.example.test", "local-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      requests.push({ url: new URL(String(url)), body: JSON.parse(String(init?.body || "{}")) });
      return Response.json(response, { status, headers: { "x-supabase-api-version": "2024-01-01" } });
    } },
  });
  return { client, requests };
}
test("confirmation resend and recovery use distinct Supabase endpoints with a clean web redirect", async () => {
  for (const mode of ["resend", "reset"] as const) {
    const { client, requests } = backend();
    assert.equal(await performAuth(client, mode, { ...fields, password: "" }, "https://nepeel.com/private?token=excluded#access_token=excluded"), mode);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url.pathname, mode === "resend" ? "/auth/v1/resend" : "/auth/v1/recover");
    assert.equal(requests[0].url.searchParams.get("redirect_to"), "https://nepeel.com");
    assert.equal(requests[0].body.email, "member@example.test");
    assert.equal(requests[0].body.password, undefined);
    if (mode === "resend") assert.equal(requests[0].body.type, "signup");
  }
});
test("signup sends the trimmed display name and waits for confirmation when no session exists", async () => {
  const { client, requests } = backend({ id: "local-member", identities: [] });
  assert.equal(await performAuth(client, "signup", fields, "https://nepeel.com"), "confirm");
  assert.deepEqual(requests[0].body.data, { display_name: "Member" });
  assert.equal(requests[0].body.password, fields.password);
});
test("invalid fields and unsafe redirects never reach the server", async () => {
  const { client, requests } = backend();
  await assert.rejects(performAuth(client, "resend", { ...fields, email: "bad" }, "https://nepeel.com"), /INVALID_EMAIL/);
  await assert.rejects(performAuth(client, "signup", { ...fields, password: "short" }, "https://nepeel.com"), /INVALID_PASSWORD/);
  await assert.rejects(performAuth(client, "signup", { ...fields, name: " " }, "https://nepeel.com"), /INVALID_NAME/);
  for (const url of ["http://nepeel.com", "javascript:alert(1)", "https://user:password@nepeel.com"]) {
    await assert.rejects(performAuth(client, "reset", fields, url), /INVALID_REDIRECT/);
  }
  assert.equal(requests.length, 0);
  assert.equal(authRedirect("http://127.0.0.1:5173/#hi"), "http://127.0.0.1:5173");
  assert.equal(validateAuth("login", { ...fields, password: "old" }), null);
});
test("unknown addresses have the same recovery notice and rate errors remain retryable", async () => {
  for (const mode of ["resend", "reset"] as const) {
    const missing = backend({ code: "user_not_found", msg: "Not found" }, 400);
    assert.equal(await performAuth(missing.client, mode, fields, "https://nepeel.com"), mode);
    const limited = backend({ code: "over_email_send_rate_limit", msg: "Too many requests" }, 429);
    await assert.rejects(performAuth(limited.client, mode, fields, "https://nepeel.com"), error => {
      assert.match(authError(error), /요청이 많아요/);
      assert.match(authError(error, true), /Too many requests/);
      return true;
    });
  }
});
test("login only completes after a session is returned", async () => {
  const failed = backend({ code: "email_not_confirmed", msg: "Email not confirmed" }, 400);
  await assert.rejects(performAuth(failed.client, "login", fields, "https://nepeel.com"), error => {
    assert.match(authError(error), /인증메일/); return true;
  });
  const malformed = backend({});
  await assert.rejects(performAuth(malformed.client, "login", fields, "https://nepeel.com"));
  const good = backend({ access_token: "local-fixture-token", refresh_token: "local-fixture-refresh", token_type: "bearer", expires_in: 3600, user: { id: "local-member" } });
  assert.equal(await performAuth(good.client, "login", fields, "https://nepeel.com"), null);
  assert.equal(good.requests[0].url.searchParams.get("grant_type"), "password");
});
