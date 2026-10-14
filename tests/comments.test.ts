import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { PGlite } from "@electric-sql/pglite";
import { COMMENT_PAGE_SIZE, createComment, getCommentPage } from "../shared/comments";
import type { CommentCursor } from "../shared/comments";

const user = "00000000-0000-4000-8000-000000000001";
const post = "00000000-0000-4000-8000-000000000002";
const id = "00000000-0000-4000-8000-000000000003";
const row = { id, body: "A real moment", user_id: user, created_at: "2026-10-14T00:00:00.123456+00:00", profiles: { username: "member", display_name: "Member" } };
function clientWith(fetcher: typeof fetch) {
  return createClient("https://comments.example.test", "local-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher },
  });
}

test("comments page past 100 without omissions across equal and microsecond timestamps", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table comments(id uuid primary key, body text, user_id uuid, post_id uuid, created_at timestamptz);
      insert into comments select ('00000000-0000-4000-8000-' || lpad(to_hex(n),12,'0'))::uuid, 'Comment ' || n,
      '${user}', '${post}', case when n <= 65 then '2026-10-14T00:00:00.123456Z'::timestamptz else '2026-10-14T00:00:00.123455Z'::timestamptz end from generate_series(1,131) n;`);
    const requests: URL[] = [];
    const client = clientWith(async url => {
      const request = new URL(String(url)); requests.push(request);
      assert.equal(request.searchParams.get("order"), "created_at.desc,id.desc");
      assert.equal(request.searchParams.get("limit"), String(COMMENT_PAGE_SIZE + 1));
      assert.equal(request.searchParams.get("post_id"), `eq.${post}`);
      assert.equal(request.searchParams.has("offset"), false);
      const filter = request.searchParams.get("or");
      const cursor = filter?.match(/^\(created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([0-9a-f-]+)\)\)$/);
      if (filter) { assert.ok(cursor); assert.equal(cursor[1], cursor[2]); }
      const result = await db.query(`select id, body, user_id,
        to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
        json_build_object('username','member','display_name','Member') as profiles
        from comments where post_id=$1 and ($2::timestamptz is null or (created_at,id)<($2::timestamptz,$3::uuid))
        order by created_at desc,id desc limit 31`, [post, cursor?.[1] ?? null, cursor?.[3] ?? null]);
      return Response.json(result.rows);
    });
    let cursor: CommentCursor | null = null;
    const ids: string[] = [];
    for (let pageNumber = 0; pageNumber < 8; pageNumber++) {
      const page = await getCommentPage(client, post, cursor);
      assert.ok(page.comments.length <= COMMENT_PAGE_SIZE);
      ids.push(...page.comments.map(comment => comment.id));
      cursor = page.cursor;
      if (!page.hasMore) break;
    }
    assert.equal(ids.length, 131);
    assert.equal(new Set(ids).size, 131);
    assert.equal(requests.length, 5);
    assert.match(requests[1].searchParams.get("or")!, /\.123456Z/);
    assert.equal(ids[0], "00000000-0000-4000-8000-000000000041");
  } finally { await db.close(); }
});

test("unsafe comment cursor and invalid content never reach the transport", async () => {
  let calls = 0;
  const client = clientWith(async () => { calls++; return Response.json([]); });
  await assert.rejects(getCommentPage(client, "invalid"), /INVALID_POST/);
  await assert.rejects(getCommentPage(client, post, { id, created_at: "2026-10-14T00:00:00Z),id.gt.0" }), /INVALID_COMMENT_CURSOR/);
  await assert.rejects(getCommentPage(client, post, { id: "bad,id.gt.0", created_at: row.created_at }), /INVALID_COMMENT_CURSOR/);
  await assert.rejects(createComment(client, user, post, id, " "), /INVALID_COMMENT_BODY/);
  await assert.rejects(createComment(client, user, post, id, "a".repeat(501)), /INVALID_COMMENT_BODY/);
  assert.equal(calls, 0);
});

test("comment creation trims content and sends the stable caller-generated ID", async () => {
  const client = clientWith(async (url, init) => {
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { id, user_id: user, post_id: post, body: row.body });
    assert.ok(new URL(String(url)).searchParams.get("select")?.includes("profiles"));
    return Response.json(row);
  });
  assert.deepEqual(await createComment(client, user, post, id, ` ${row.body} `), row);
});

test("an uncertain committed insert is recovered without updating another comment", async () => {
  const methods: string[] = [];
  const client = clientWith(async (url, init) => {
    methods.push(String(init?.method ?? "GET"));
    if (init?.method === "POST") return Response.json({ code: "23505", message: "duplicate key" }, { status: 409 });
    const query = new URL(String(url)).searchParams;
    assert.equal(query.get("id"), `eq.${id}`);
    assert.equal(query.get("user_id"), `eq.${user}`);
    assert.equal(query.get("post_id"), `eq.${post}`);
    return Response.json([row]);
  });
  assert.deepEqual(await createComment(client, user, post, id, row.body), row);
  assert.deepEqual(methods, ["POST", "GET"]);
});

test("ID collision with different content or an inaccessible row is not reported as success", async () => {
  for (const existing of [[], [{ ...row, body: "Other content" }]]) {
    const client = clientWith(async (_url, init) => init?.method === "POST"
      ? Response.json({ code: "23505", message: "duplicate key" }, { status: 409 })
      : Response.json(existing));
    await assert.rejects(createComment(client, user, post, id, row.body), error => {
      assert.equal((error as { code: string }).code, "23505"); return true;
    });
  }
});
