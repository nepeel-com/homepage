import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { publishPhoto } from "../server/publication.js";
import { ApiError } from "../server/validation.js";

const db = new PGlite();
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
let imageBase64: string;
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role; grant all on storage.objects to anon,authenticated,service_role;`);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  imageBase64 = (
    await sharp({
      create: { width: 480, height: 640, channels: 3, background: "#abc123" },
    })
      .jpeg()
      .toBuffer()
  ).toString("base64");
});
beforeEach(async () => {
  await db.exec(`truncate auth.users cascade; truncate public.media_cleanup_jobs;
    insert into auth.users values('${alice}','{}'),('${bob}','{}');`);
});
after(() => db.close());

async function newChallenge(user = alice) {
  const result = await db.query<{ id: string }>(
    "select * from public.issue_challenge($1,'test-nonce','capture')",
    [user],
  );
  return result.rows[0].id;
}
function request(id: string) {
  return {
    challengeId: id,
    imageBase64,
    caption: "A moment",
    proof: { platform: "android", token: "local-test" },
  };
}
type Fault =
  "" | "upload" | "upload-response" | "finish-response" | "reserve-response";
function backend(initialFault: Fault = "") {
  const objects = new Map<string, unknown>();
  const calls: string[] = [];
  let fault = initialFault;
  const client = createClient(
    "https://publication.example.test",
    "local-test-key",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const url = new URL(String(input));
          const name = url.pathname.split("/").at(-1)!;
          calls.push(url.pathname);
          if (url.pathname.startsWith("/storage/v1/object/captures/")) {
            const path = url.pathname.slice(
              "/storage/v1/object/captures/".length,
            );
            assert.equal(init?.method, "POST");
            assert.equal(new Headers(init?.headers).get("x-upsert"), "false");
            if (fault === "upload") {
              fault = "";
              return Response.json({ message: "outage" }, { status: 503 });
            }
            if (objects.has(path))
              return Response.json(
                { code: "ResourceAlreadyExists", message: "exists" },
                { status: 409 },
              );
            objects.set(path, init?.body);
            if (fault === "upload-response") {
              fault = "";
              return Response.json(
                { message: "lost response" },
                { status: 503 },
              );
            }
            return Response.json({ Key: `captures/${path}` });
          }
          try {
            if (name === "capture_publications") {
              const rows = await db.query(
                "select * from public.capture_publications where challenge_id=$1 and user_id=$2",
                [
                  url.searchParams.get("challenge_id")?.slice(3),
                  url.searchParams.get("user_id")?.slice(3),
                ],
              );
              return Response.json(rows.rows);
            }
            const args = JSON.parse(String(init?.body));
            let rows;
            if (name === "begin_capture_attempt") {
              rows = (
                await db.query(
                  "select * from public.begin_capture_attempt($1,$2,$3)",
                  [args.p_id, args.p_user, args.p_purpose],
                )
              ).rows;
            } else if (name === "reserve_capture_publication") {
              rows = (
                await db.query(
                  "select * from public.reserve_capture_publication($1,$2,$3,$4,$5,$6,$7,$8,$9)",
                  [
                    args.p_id,
                    args.p_user,
                    args.p_hash,
                    args.p_caption,
                    args.p_platform,
                    args.p_key ?? null,
                    args.p_previous ?? null,
                    args.p_next ?? null,
                    args.p_context ?? null,
                  ],
                )
              ).rows;
            } else if (name === "finish_capture_publication") {
              rows = (
                await db.query<{ id: string }>(
                  "select public.finish_capture_publication($1,$2) as id",
                  [args.p_id, args.p_user],
                )
              ).rows[0].id;
            } else throw new Error(`Unexpected call ${url.pathname}`);
            if (
              (name === "reserve_capture_publication" &&
                fault === "reserve-response") ||
              (name === "finish_capture_publication" &&
                fault === "finish-response")
            ) {
              fault = "";
              return Response.json(
                { message: "lost response" },
                { status: 503 },
              );
            }
            return Response.json(rows);
          } catch (error) {
            return Response.json(
              {
                message: error instanceof Error ? error.message : "DB error",
                code: "P0001",
              },
              { status: 400 },
            );
          }
        },
      },
    },
  );
  let verified = 0;
  const verify = async () => {
    verified++;
    return undefined;
  };
  return { client, verify, objects, calls, verified: () => verified };
}

test("publication tables and all mutating RPCs reject member and anonymous credentials", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    for (const query of [
      "select * from public.capture_publications",
      `select * from public.reserve_capture_publication(gen_random_uuid(),'${alice}',repeat('a',64),'','android')`,
      `select public.finish_capture_publication(gen_random_uuid(),'${alice}')`,
      "select public.expire_capture_publications()",
    ])
      await assert.rejects(db.query(query), /permission denied/);
    await db.exec("reset role");
  }
});
test("failed integrity verification never creates a receipt, upload or post", async () => {
  const b = backend();
  const body = request(await newChallenge());
  await assert.rejects(
    publishPhoto(b.client, alice, body, async () => {
      throw new ApiError(403, "invalid proof");
    }),
    /invalid proof/,
  );
  assert.equal(
    (await db.query("select * from public.capture_publications")).rows.length,
    0,
  );
  assert.equal(b.objects.size, 0);
});
for (const fault of [
  "upload",
  "upload-response",
  "reserve-response",
  "finish-response",
] as Fault[]) {
  test(`${fault} recovers one immutable post without re-consuming the proof`, async () => {
    const b = backend(fault);
    const body = request(await newChallenge());
    await assert.rejects(
      publishPhoto(b.client, alice, body, b.verify),
      /다시 시도/,
    );
    // A verified receipt may finish even when its original capture challenge expires.
    await db.query(
      "update public.capture_challenges set expires_at=now()-interval '1 second' where id=$1",
      [body.challengeId],
    );
    const first = await publishPhoto(b.client, alice, body, b.verify);
    const again = await publishPhoto(b.client, alice, body, b.verify);
    assert.deepEqual(again, first);
    assert.equal(b.verified(), 1);
    assert.equal(b.objects.size, 1);
    assert.deepEqual(
      (await db.query("select id,caption from public.posts")).rows,
      [{ id: first.id, caption: body.caption }],
    );
    assert.equal(
      (await db.query("select * from public.media_cleanup_jobs")).rows.length,
      0,
    );
  });
}
test("concurrent identical submissions create one post and return the same ID", async () => {
  const b = backend();
  const body = request(await newChallenge());
  const result = await Promise.all([
    publishPhoto(b.client, alice, body, b.verify),
    publishPhoto(b.client, alice, body, b.verify),
  ]);
  assert.deepEqual(result[0], result[1]);
  assert.equal(b.objects.size, 1);
  assert.equal((await db.query("select * from public.posts")).rows.length, 1);
});
test("a reserved receipt rejects a different account, caption, image or platform", async () => {
  const b = backend("upload");
  const body = request(await newChallenge());
  await assert.rejects(publishPhoto(b.client, alice, body, b.verify));
  const changedImage = (
    await sharp({
      create: { width: 480, height: 640, channels: 3, background: "blue" },
    })
      .jpeg()
      .toBuffer()
  ).toString("base64");
  for (const altered of [
    { ...body, caption: "Changed" },
    { ...body, imageBase64: changedImage },
    { ...body, proof: { platform: "ios" } },
  ])
    await assert.rejects(
      publishPhoto(b.client, alice, altered, b.verify),
      /변경할 수 없어요/,
    );
  await assert.rejects(publishPhoto(b.client, bob, body, b.verify), /만료/);
  assert.equal(b.objects.size, 0);
});
test("iOS nonce, counter and receipt creation roll back together; retry does not advance counter", async () => {
  const id = await newChallenge();
  await db.query(
    "insert into public.device_keys(key_id,user_id,public_key,sign_count) values('ios-key',$1,'fixture',4)",
    [alice],
  );
  const reserve = (previous: number, next: number) =>
    db.query(
      "select * from public.reserve_capture_publication($1,$2,repeat('a',64),'','ios','ios-key',$3,$4)",
      [id, alice, previous, next],
    );
  await assert.rejects(reserve(3, 5), /Invalid assertion counter/);
  assert.equal(
    (
      await db.query<{ used_at: Date | null }>(
        "select used_at from public.capture_challenges where id=$1",
        [id],
      )
    ).rows[0].used_at,
    null,
  );
  assert.equal(
    (await db.query("select * from public.capture_publications")).rows.length,
    0,
  );
  const one = await reserve(4, 5);
  const two = await reserve(5, 6);
  assert.deepEqual(one.rows, two.rows);
  assert.equal(
    Number(
      (
        await db.query<{ sign_count: number }>(
          "select sign_count from public.device_keys",
        )
      ).rows[0].sign_count,
    ),
    5,
  );
});
test("deleted posts cannot be resurrected by replay and cleanup waits for in-flight uploads", async () => {
  const b = backend();
  const body = request(await newChallenge());
  const result = await publishPhoto(b.client, alice, body, b.verify);
  await db.query("delete from public.posts where id=$1", [result.id]);
  await assert.rejects(
    publishPhoto(b.client, alice, body, b.verify),
    /게시가 종료/,
  );
  assert.equal((await db.query("select * from public.posts")).rows.length, 0);
  assert.equal(
    (
      await db.query<{ delayed: boolean }>(
        "select not_before>now()+interval '1 minute' as delayed from public.media_cleanup_jobs",
      )
    ).rows[0].delayed,
    true,
  );
});
test("account deletion queues both pending and completed capture paths durably", async () => {
  const b = backend("upload-response");
  const pending = request(await newChallenge());
  await assert.rejects(publishPhoto(b.client, alice, pending, b.verify));
  await publishPhoto(b.client, alice, request(await newChallenge()), b.verify);
  await db.query("delete from auth.users where id=$1", [alice]);
  assert.equal(
    (await db.query("select * from public.capture_publications")).rows.length,
    0,
  );
  const jobs = await db.query<{ image_path: string; delayed: boolean }>(
    "select image_path,not_before>now()+interval '1 minute' as delayed from public.media_cleanup_jobs",
  );
  assert.equal(jobs.rows.length, 2);
  assert.ok(jobs.rows.every((row) => row.delayed));
});
test("expiry queues abandoned uploads; receipt retention never queues published photos", async () => {
  const b = backend("upload-response");
  const pending = request(await newChallenge());
  await assert.rejects(publishPhoto(b.client, alice, pending, b.verify));
  await db.query(
    "update public.capture_publications set expires_at=now()-interval '1 second'",
  );
  await db.query("select public.expire_capture_publications()");
  await assert.rejects(
    publishPhoto(b.client, alice, pending, b.verify),
    /게시가 종료/,
  );
  const published = await publishPhoto(
    b.client,
    alice,
    request(await newChallenge()),
    b.verify,
  );
  await db.exec(
    "update public.capture_challenges set created_at=now()-interval '2 days'; select public.expire_capture_publications()",
  );
  assert.equal(
    (await db.query("select * from public.capture_publications")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.posts where id=$1", [published.id]))
      .rows.length,
    1,
  );
  const jobs = await db.query<{ image_path: string }>(
    "select * from public.media_cleanup_jobs",
  );
  assert.equal(jobs.rows.length, 1);
  assert.ok(!String(jobs.rows[0].image_path).includes(published.id));
});

async function asMember<T = Record<string, unknown>>(
  user: string,
  query: string,
  params: unknown[] = [],
) {
  await db.exec(
    `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true)`,
  );
  try {
    const result = await db.query<T>(query, params);
    await db.exec("commit");
    return result.rows;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
async function locatedPost(lat: number, lon: number, audience = "followers") {
  const row = (
    await db.query<{ id: string }>(
      "insert into public.posts(user_id,image_path,image_sha256,platform,captured_at) values($1,gen_random_uuid()::text,repeat('a',64),'android',now()) returning id",
      [bob],
    )
  ).rows[0];
  await db.query(
    "insert into public.photo_places values($1,$2,$3,$4,'A place',$5)",
    [row.id, bob, lat, lon, audience],
  );
  return row.id;
}
test("place visibility respects audience, follows and blocks in both directions", async () => {
  const id = await locatedPost(37.567, 126.978);
  const read = () =>
    asMember(alice, "select * from public.photo_places where post_id=$1", [id]);
  assert.equal((await read()).length, 0);
  await db.query("insert into public.follows values($1,$2)", [alice, bob]);
  assert.equal((await read()).length, 1);
  for (const pair of [
    [alice, bob],
    [bob, alice],
  ]) {
    await db.query(
      "insert into public.connection_blocks(user_id,blocked_id) values($1,$2)",
      pair,
    );
    assert.equal((await read()).length, 0);
    assert.equal(
      (
        await asMember(
          alice,
          "select * from public.nearby_followed_photos(37.567,126.978)",
        )
      ).length,
      0,
    );
    await db.exec("delete from public.connection_blocks");
  }
  await asMember(bob, "select public.set_photo_place_audience($1,'private')", [
    id,
  ]);
  assert.equal((await read()).length, 0);
  assert.equal(
    (await asMember(bob, "select * from public.photo_places")).length,
    1,
  );
  await assert.rejects(
    asMember(alice, "select public.set_photo_place_audience($1,'members')", [
      id,
    ]),
    /unavailable/,
  );
  await asMember(bob, "select public.set_photo_place_audience($1,'members')", [
    id,
  ]);
  await db.exec("delete from public.follows");
  assert.equal((await read()).length, 1);
  assert.equal(
    (
      await asMember(
        alice,
        "select * from public.nearby_followed_photos(37.567,126.978)",
      )
    ).length,
    0,
    "nearby lists followed people only",
  );
  await asMember(bob, "select public.set_photo_place_audience($1,null)", [id]);
  assert.equal((await read()).length, 0);
});
test("nearby selection crosses date lines, handles poles, caps radius and enforces result limit", async () => {
  await db.query("insert into public.follows values($1,$2)", [alice, bob]);
  const across = await locatedPost(0, -179.999);
  const polar = await locatedPost(90, 180);
  await locatedPost(0, 179.9);
  assert.deepEqual(
    (
      await asMember<{ post_id: string }>(
        alice,
        "select * from public.nearby_followed_photos(0,179.999,1000)",
      )
    ).map((r) => r.post_id),
    [across],
  );
  assert.deepEqual(
    (
      await asMember<{ post_id: string }>(
        alice,
        "select * from public.nearby_followed_photos(90,0,100)",
      )
    ).map((r) => r.post_id),
    [polar],
  );
  assert.equal(
    (
      await asMember(
        alice,
        "select * from public.nearby_followed_photos(91,0,1000)",
      )
    ).length,
    0,
  );
  for (let i = 0; i < 25; i++) await locatedPost(37.5, 127);
  assert.equal(
    (
      await asMember(
        alice,
        "select * from public.nearby_followed_photos(37.5,127,1000000)",
      )
    ).length,
    20,
  );
});
test("filter, private location and source reference persist atomically and cannot change on retry", async () => {
  const source = await locatedPost(37.5, 127);
  const b = backend("finish-response");
  const body = {
    ...request(await newChallenge()),
    context: {
      version: 1,
      filter: "warm",
      place: {
        latitude: 37.566512,
        longitude: 126.978,
        label: "Seoul",
        audience: "private",
      },
      referencePostId: source,
    },
  };
  await assert.rejects(publishPhoto(b.client, alice, body, b.verify));
  const saved = await publishPhoto(b.client, alice, body, b.verify);
  assert.equal(
    (
      await db.query<{ photo_filter: string }>(
        "select photo_filter from public.posts where id=$1",
        [saved.id],
      )
    ).rows[0].photo_filter,
    "warm",
  );
  const mine = await asMember(
    alice,
    "select * from public.get_photo_details($1)",
    [[saved.id]],
  );
  assert.equal(Number(mine[0].latitude), 37.567);
  assert.equal(mine[0].reference_post_id, source);
  const other = await asMember(
    bob,
    "select * from public.get_photo_details($1)",
    [[saved.id]],
  );
  assert.equal(other[0].latitude, null);
  assert.equal(other[0].photo_filter, "warm");
  await assert.rejects(
    publishPhoto(
      b.client,
      alice,
      { ...body, context: { ...body.context, filter: "cool" } },
      b.verify,
    ),
    /변경/,
  );
  await assert.rejects(
    publishPhoto(
      b.client,
      alice,
      {
        ...body,
        context: {
          ...body.context,
          place: { ...body.context.place, audience: "members" },
        },
      },
      b.verify,
    ),
    /변경/,
  );
  await db.query("delete from public.posts where id=$1", [source]);
  assert.equal(
    (
      await db.query<{ reference_post_id: string | null }>(
        "select reference_post_id from public.posts where id=$1",
        [saved.id],
      )
    ).rows[0].reference_post_id,
    null,
  );
});
