import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accountAction } from "../shared/account";

test("account requests reject a changed or missing session before transmission", async () => {
  let transmitted = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    transmitted++;
    return Response.json({ ok: true });
  };
  try {
    for (const session of [
      null,
      { user: { id: "other-member" }, access_token: "test-other-token" },
    ]) {
      const client = {
        auth: { getSession: async () => ({ data: { session }, error: null }) },
      } as unknown as SupabaseClient;
      await assert.rejects(
        accountAction(
          client,
          "https://api.example.test",
          { action: "deleteAccount" },
          "intended-member",
        ),
        /로그인 계정/,
      );
    }
    assert.equal(transmitted, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test("account requests use the intended account snapshot and propagate server errors", async () => {
  const original = globalThis.fetch;
  const client = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: "intended-member" },
            access_token: "test-member-token",
          },
        },
        error: null,
      }),
    },
  } as unknown as SupabaseClient;
  let fail = false;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.example.test/api/capture");
    assert.equal(
      (init?.headers as Record<string, string>).Authorization,
      "Bearer test-member-token",
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      action: "delete",
      postId: "test-photo",
    });
    return fail
      ? Response.json({ error: "Denied" }, { status: 403 })
      : Response.json({ deleted: true });
  };
  try {
    assert.deepEqual(
      await accountAction(
        client,
        "https://api.example.test/",
        { action: "delete", postId: "test-photo" },
        "intended-member",
      ),
      { deleted: true },
    );
    fail = true;
    await assert.rejects(
      accountAction(
        client,
        "https://api.example.test",
        { action: "delete", postId: "test-photo" },
        "intended-member",
      ),
      /Denied/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
