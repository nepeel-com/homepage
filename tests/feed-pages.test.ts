import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { getFeedPage } from "../shared/data";
import type { FeedCursor } from "../shared/data";

const db = new PGlite();
const member = "00000000-0000-4000-8000-000000000001";
const friend = "00000000-0000-4000-8000-000000000002";
const photoId = (n: number) =>
  `10000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security; grant usage on schema storage to anon,authenticated,service_role; grant all on storage.objects to anon,authenticated,service_role;`);
  for (const file of [
    "202610140001_nepeel.sql",
    "202610140002_capture_hardening.sql",
    "202610140003_hi_connections.sql",
    "202610140004_account_cleanup.sql",
    "202610140005_connection_unblock.sql",
    "202610140006_capture_publications.sql",
    "202610140007_photo_places.sql",
    "202610140008_feed_pages.sql",
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  await db.exec(
    `insert into auth.users values('${member}','{"display_name":"Member"}'),('${friend}','{"display_name":"Friend"}')`,
  );
});
beforeEach(async () => {
  await db.exec(
    "delete from public.posts; truncate public.follows, public.media_cleanup_jobs;",
  );
});
after(() => db.close());
async function memberQuery(sql: string, args: unknown[] = []) {
  await db.exec(
    `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${member}',true)`,
  );
  try {
    const r = await db.query<{ rows: unknown[] }>(sql, args);
    await db.exec("commit");
    return r.rows;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
async function seed(count: number) {
  for (let n = 1; n <= count; n++)
    await db.query(
      `insert into public.posts(id,user_id,caption,image_path,created_at,captured_at,platform,image_sha256)
    values($1,$2,$3,$4,$5,$5,'android',repeat('a',64))`,
      [
        photoId(n),
        n % 2 ? member : friend,
        `Photo ${n}`,
        `${member}/${photoId(n)}.jpg`,
        n <= 30 ? "2026-10-14T00:00:00.123456Z" : "2026-10-14T00:00:00.123455Z",
      ],
    );
}
function transport() {
  const requests: { name: string; body: Record<string, unknown> }[] = [];
  const signedCounts: number[] = [];
  const client = createClient("https://feed.example.test", "local-test-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const body = JSON.parse(String(init?.body ?? "{}"));
        const name = url.pathname.split("/").at(-1)!;
        requests.push({ name, body });
        if (url.pathname.includes("/storage/")) {
          signedCounts.push(body.paths.length);
          return Response.json(
            body.paths.map((path: string) => ({
              path,
              signedURL: `/object/sign/captures/${path}?token=test`,
            })),
          );
        }
        const result =
          name === "get_feed_page"
            ? await memberQuery(
                "select coalesce(json_agg(t),'[]'::json) as rows from public.get_feed_page($1,$2,$3,$4,$5) t",
                [
                  body.p_mode,
                  body.p_search,
                  body.p_cursor_at,
                  body.p_cursor_id,
                  body.p_post,
                ],
              )
            : await memberQuery(
                "select coalesce(json_agg(t),'[]'::json) as rows from public.get_photo_details($1::uuid[]) t",
                [body.p_ids],
              );
        return Response.json(result[0].rows);
      },
    },
  });
  return { client, requests, signedCounts };
}
test("feed pages preserve equal/microsecond timestamp ordering and hydrate only visible photos", async () => {
  await seed(61);
  const { client, requests, signedCounts } = transport();
  let cursor: FeedCursor | null = null;
  const found: string[] = [];
  do {
    const page = await getFeedPage(client, "all", "", cursor);
    found.push(...page.posts.map((p) => p.id));
    assert.ok(
      page.posts.every(
        (p) =>
          p.image_url?.includes("token=test") &&
          p.details?.photo_filter === "original",
      ),
    );
    if (page.cursor) assert.match(page.cursor.createdAt, /\.12345[56]/);
    cursor = page.hasMore ? page.cursor : null;
  } while (cursor);
  const expected = (
    await db.query<{ id: string }>(
      "select id from public.posts order by created_at desc,id desc",
    )
  ).rows.map((p) => p.id);
  assert.deepEqual(found, expected);
  assert.equal(new Set(found).size, 61);
  assert.deepEqual(signedCounts, [20, 20, 20, 1]);
  assert.ok(
    requests
      .filter((r) => r.name === "get_feed_page")
      .every((r) => !("p_offset" in r.body)),
  );
});
test("deleting earlier photos and inserting a new photo cannot skip or repeat older photos", async () => {
  await seed(61);
  const { client } = transport();
  const expected = (
    await db.query<{ id: string }>(
      "select id from public.posts order by created_at desc,id desc",
    )
  ).rows.map((p) => p.id);
  const first = await getFeedPage(client);
  const removed = [first.posts[0].id, first.posts.at(-1)!.id];
  await db.query("delete from public.posts where id=any($1::uuid[])", [
    removed,
  ]);
  await db.query(
    `insert into public.posts(id,user_id,caption,image_path,created_at,captured_at,platform,image_sha256)
    values($1,$2,'New arrival',$3,'2026-10-15','2026-10-15','android',repeat('b',64))`,
    [photoId(999), friend, `${friend}/${photoId(999)}.jpg`],
  );
  let cursor = first.cursor;
  const found = first.posts
    .filter((p) => !removed.includes(p.id))
    .map((p) => p.id);
  while (cursor) {
    const page = await getFeedPage(client, "all", "", cursor);
    found.push(...page.posts.map((p) => p.id));
    cursor = page.hasMore ? page.cursor : null;
  }
  assert.deepEqual(
    found,
    expected.filter((id) => !removed.includes(id)),
  );
  assert.equal((await getFeedPage(client)).posts[0].id, photoId(999));
});
test("unsaving a fetched photo, including the cursor photo, does not move the next saved page", async () => {
  await seed(61);
  await db.query(
    "insert into public.bookmarks(user_id,post_id) select $1,id from public.posts",
    [member],
  );
  const { client } = transport();
  const expected = (
    await db.query<{ id: string }>(
      "select id from public.posts order by created_at desc,id desc",
    )
  ).rows.map((p) => p.id);
  const first = await getFeedPage(client, "saved");
  const removed = [first.posts[0].id, first.posts.at(-1)!.id];
  await memberQuery(
    "delete from public.bookmarks where post_id=any($1::uuid[])",
    [removed],
  );
  const next = await getFeedPage(client, "saved", "", first.cursor);
  assert.deepEqual(
    next.posts.map((p) => p.id),
    expected.slice(20, 40),
  );
});
test("feed modes, search, single-post focus and exact final page retain their contracts", async () => {
  await seed(20);
  const { client } = transport();
  assert.equal((await getFeedPage(client)).hasMore, false);
  assert.ok(
    (await getFeedPage(client, "profile")).posts.every(
      (p) => p.user_id === member,
    ),
  );
  assert.equal((await getFeedPage(client, "following")).posts.length, 0);
  await memberQuery(
    "insert into public.follows(follower_id,following_id) values($1,$2)",
    [member, friend],
  );
  assert.ok(
    (await getFeedPage(client, "following")).posts.every(
      (p) => p.user_id === friend,
    ),
  );
  assert.deepEqual(
    (await getFeedPage(client, "all", "Photo 20")).posts.map((p) => p.id),
    [photoId(20)],
  );
  assert.deepEqual(
    (await getFeedPage(client, "all", "", null, photoId(9))).posts.map(
      (p) => p.id,
    ),
    [photoId(9)],
  );
});
test("cursor validation runs before network use and the server rejects half cursors", async () => {
  const { client, requests } = transport();
  for (const cursor of [
    { id: "bad", createdAt: "2026-10-14T00:00:00Z" },
    { id: photoId(1), createdAt: "now()" },
    { id: photoId(1), createdAt: "2026-99-14T00:00:00Z" },
  ])
    await assert.rejects(getFeedPage(client, "all", "", cursor));
  assert.equal(requests.length, 0);
  await assert.rejects(
    memberQuery("select * from public.get_feed_page(p_cursor_at:=now())"),
    /INVALID_FEED_CURSOR/,
  );
});
test("new feed RPC remains invoker-based, denies anonymous access and rejects deleted members", async () => {
  await seed(3);
  assert.equal(
    (
      await db.query<{ prosecdef: boolean }>(
        "select prosecdef from pg_proc where proname='get_feed_page'",
      )
    ).rows[0].prosecdef,
    false,
  );
  await db.exec("set role anon");
  try {
    await assert.rejects(
      db.exec("select * from public.get_feed_page()"),
      /permission denied/,
    );
  } finally {
    await db.exec("reset role");
  }
  await db.query("delete from public.profiles where id=$1", [member]);
  assert.equal((await getFeedPage(transport().client)).posts.length, 0);
});
