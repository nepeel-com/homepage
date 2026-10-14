import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, type User } from "@supabase/supabase-js";
import { cleanupMedia, deleteAccount } from "../server/account.js";
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "local@example.test",
} as User;
const body = { confirmation: "DELETE", password: "local-fixture-password" };
function backend(fail = "") {
  const requests: {
    path: string;
    query: string;
    method: string;
    body: unknown;
  }[] = [];
  const client = createClient("https://local.example.test", "local-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const path = new URL(String(url)).pathname;
        const method = init?.method || "GET";
        requests.push({
          path,
          query: new URL(String(url)).search,
          method,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        if (
          (fail === "auth" && path.includes("/auth/")) ||
          (fail === "storage" && path.includes("/storage/"))
        )
          return Response.json({ message: "temporary error" }, { status: 503 });
        if (path.endsWith("media_cleanup_jobs") && method === "GET")
          return Response.json([
            { id: "job1", image_path: `${user.id}/photo.jpg` },
          ]);
        return Response.json({});
      },
    },
  });
  return { client, requests };
}
test("account deletion requires explicit confirmation and reauthentication of the same user", async () => {
  const { client, requests } = backend();
  await assert.rejects(
    deleteAccount(
      client,
      user,
      { ...body, confirmation: "" },
      async () => user.id,
    ),
    /DELETE/,
  );
  await assert.rejects(
    deleteAccount(client, user, body, async () => "another-user"),
    /비밀번호/,
  );
  assert.equal(requests.length, 0);
});
test("failed Auth deletion does not delete media", async () => {
  const { client, requests } = backend("auth");
  await assert.rejects(
    deleteAccount(client, user, body, async () => user.id),
    /탈퇴/,
  );
  assert.equal(requests.length, 1);
  assert.match(requests[0].path, new RegExp(`/admin/users/${user.id}$`));
});
test("media cleanup acknowledges jobs only after successful object removal", async () => {
  const failed = backend("storage");
  await assert.rejects(cleanupMedia(failed.client), /cleanup_storage/);
  assert.ok(
    !failed.requests.some(
      (r) => r.method === "DELETE" && r.path.includes("media_cleanup_jobs"),
    ),
  );
  const good = backend();
  assert.equal(await cleanupMedia(good.client), 1);
  const query = new URLSearchParams(
    good.requests.find(
      (r) => r.method === "GET" && r.path.endsWith("media_cleanup_jobs"),
    )!.query,
  );
  assert.match(query.get("not_before")!, /^lte\.\d{4}-/);
  const removed = good.requests.find((r) => r.path.includes("/storage/"));
  assert.deepEqual(removed?.body, { prefixes: [`${user.id}/photo.jpg`] });
  assert.equal(good.requests.at(-1)?.method, "DELETE");
  assert.match(good.requests.at(-1)!.path, /media_cleanup_jobs/);
});
test("a storage outage after account removal leaves retry work and still confirms account deletion", async () => {
  const { client, requests } = backend("storage");
  assert.deepEqual(
    await deleteAccount(client, user, body, async () => user.id),
    { deleted: true },
  );
  assert.ok(
    !requests.some(
      (r) => r.method === "DELETE" && r.path.includes("media_cleanup_jobs"),
    ),
  );
});
