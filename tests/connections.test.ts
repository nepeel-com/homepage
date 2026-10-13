import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  c = "00000000-0000-4000-8000-000000000003";
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
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  await db.exec(
    `insert into auth.users values('${a}','{"display_name":"Alice"}'),('${b}','{"display_name":"Bob"}'),('${c}','{"display_name":"Carol"}')`,
  );
});
beforeEach(async () => {
  await db.exec(
    "truncate public.connection_preferences,public.connections,public.direct_messages,public.connection_blocks,public.connection_reports cascade",
  );
});
after(() => db.close());
async function user<T = Record<string, unknown>>(
  id: string,
  sql: string,
  params: unknown[] = [],
) {
  await db.exec(
    `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${id}',true)`,
  );
  try {
    const r = await db.query<T>(sql, params);
    await db.exec("commit");
    return r.rows;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
function pref(
  id: string,
  patch: Partial<{
    birth: string;
    gender: string;
    interested: string[];
    city: string;
    scope: string;
    intent: string;
    min: number;
    max: number;
    enabled: boolean;
  }> = {},
) {
  const p = {
    birth: "2000-01-01",
    gender: id === a ? "woman" : "man",
    interested: ["woman", "man", "nonbinary"],
    city: "seoul",
    scope: "city",
    intent: "friends",
    min: 18,
    max: 35,
    enabled: true,
    ...patch,
  };
  return user(
    id,
    "select public.save_connection_preferences($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      p.birth,
      p.gender,
      p.interested,
      p.city,
      p.scope,
      p.intent,
      p.min,
      p.max,
      p.enabled,
    ],
  );
}
async function hi() {
  return (
    await user<{ id: string | null }>(a, "select public.send_random_hi() as id")
  )[0].id;
}
async function match() {
  await pref(a);
  await pref(b);
  const id = await hi();
  assert.ok(id);
  return id;
}
const msg = (id: string) => [
  id,
  "Hello",
  "10000000-0000-4000-8000-000000000001",
];
test("private preferences and messages cannot be read by strangers or written directly", async () => {
  const id = await match();
  assert.equal(
    (await user(c, "select * from public.connection_preferences")).length,
    0,
  );
  assert.equal((await user(c, "select * from public.connections")).length, 0);
  assert.equal(
    (await user(c, "select * from public.get_direct_messages($1)", [id]))
      .length,
    0,
  );
  assert.equal(
    (await user(c, "select * from public.get_connections()")).length,
    0,
  );
  for (const sql of [
    "select public.send_random_hi()",
    "select * from public.connection_preferences",
  ]) {
    await db.exec("set role anon");
    await assert.rejects(db.exec(sql), /permission denied/);
    await db.exec("reset role");
  }
  await assert.rejects(
    user(a, "update public.connection_preferences set birth_date='1990-01-01'"),
    /permission denied/,
  );
  await assert.rejects(
    user(
      a,
      "insert into public.direct_messages(connection_id,sender_id,body,client_id) values($1,$2,'spoof',gen_random_uuid())",
      [id, b],
    ),
    /permission denied/,
  );
  await assert.rejects(
    user(a, "update public.connections set status='accepted'"),
    /permission denied/,
  );
});
test("adult eligibility and birthdate immutability are checked on the server", async () => {
  await assert.rejects(pref(a, { birth: "2015-01-01" }), /ADULTS_ONLY/);
  await pref(a);
  await assert.rejects(pref(a, { birth: "1995-01-01" }), /BIRTH_DATE_LOCKED/);
  await assert.rejects(pref(a, { min: 17 }), /check constraint/);
  await assert.rejects(pref(a, { interested: [] }), /check constraint/);
  await assert.rejects(
    pref(a, { city: "my street address" }),
    /check constraint/,
  );
});
test("matching respects both genders, age ranges, city, purpose and opt-in", async () => {
  await pref(a);
  assert.equal(await hi(), null);
  for (const patch of [
    { enabled: false },
    { city: "tokyo" },
    { interested: ["man"] },
    { min: 40, max: 50 },
    { intent: "dating" },
  ]) {
    await pref(b, patch);
    assert.equal(await hi(), null);
  }
  await pref(b);
  assert.ok(await hi());
  assert.equal(
    (await db.query("select * from public.direct_messages")).rows.length,
    1,
  );
});
test("worldwide is mutual; city preference cannot be widened by the other member", async () => {
  await pref(a, { scope: "global" });
  await pref(b, { city: "tokyo" });
  assert.equal(await hi(), null);
  await pref(b, { city: "tokyo", scope: "global" });
  assert.ok(await hi());
});
test("inactive discovery expires and paused members cannot initiate", async () => {
  await pref(a);
  await pref(b);
  await db.exec(
    `update public.connection_preferences set updated_at=now()-interval '8 days' where user_id='${b}'`,
  );
  assert.equal(await hi(), null);
  await user(a, "select public.pause_connections()");
  await assert.rejects(hi(), /OPT_IN_REQUIRED/);
});
test("a fixed hi is delivered once; only the recipient can accept before text is enabled", async () => {
  const id = await match();
  assert.deepEqual(
    (
      await user<{ body: string }>(
        b,
        "select body from public.get_direct_messages($1)",
        [id],
      )
    ).map((r) => r.body),
    ["hi"],
  );
  await assert.rejects(
    user(a, "select public.respond_to_hi($1,true)", [id]),
    /REQUEST_CLOSED/,
  );
  await assert.rejects(
    user(c, "select public.respond_to_hi($1,true)", [id]),
    /NOT_FOUND/,
  );
  await assert.rejects(
    user(a, "select public.send_direct_message($1,$2,$3)", msg(id)),
    /REQUEST_CLOSED/,
  );
  await user(b, "select public.respond_to_hi($1,true)", [id]);
  const first = await user(
    a,
    "select public.send_direct_message($1,$2,$3) as id",
    msg(id),
  );
  assert.deepEqual(
    await user(a, "select public.send_direct_message($1,$2,$3) as id", msg(id)),
    first,
  );
  assert.equal(
    (await user(b, "select * from public.get_direct_messages($1)", [id]))
      .length,
    2,
  );
  await assert.rejects(
    user(c, "select public.send_direct_message($1,$2,$3)", msg(id)),
    /NOT_FOUND/,
  );
});
test("declined and expired requests cannot become conversations", async () => {
  const id = await match();
  await user(b, "select public.respond_to_hi($1,false)", [id]);
  await assert.rejects(
    user(b, "select public.respond_to_hi($1,true)", [id]),
    /REQUEST_CLOSED/,
  );
  await db.query(
    "update public.connections set status='pending',expires_at=now()-interval '1 second' where id=$1",
    [id],
  );
  await assert.rejects(
    user(b, "select public.respond_to_hi($1,true)", [id]),
    /REQUEST_CLOSED/,
  );
  assert.equal(
    (
      await user<{ status: string }>(
        a,
        "select * from public.get_connections()",
      )
    )[0].status,
    "expired",
  );
});
test("blocking prevents delivery/read/rematching and creates a private report", async () => {
  const id = await match();
  await user(b, "select public.respond_to_hi($1,true)", [id]);
  await assert.rejects(
    user(c, "select public.block_connection($1,'spam')", [id]),
    /NOT_FOUND/,
  );
  await user(b, "select public.block_connection($1,'harassment')", [id]);
  assert.equal(
    (await user(a, "select * from public.get_direct_messages($1)", [id]))
      .length,
    0,
  );
  await assert.rejects(
    user(a, "select public.send_direct_message($1,$2,$3)", msg(id)),
    /REQUEST_CLOSED/,
  );
  await assert.rejects(
    user(a, "select * from public.connection_reports"),
    /permission denied/,
  );
  await db.exec(
    "update public.connections set created_at=now()-interval '2 minutes'",
  );
  assert.equal(await hi(), null);
  assert.equal(
    (await db.query("select * from public.connection_reports")).rows.length,
    1,
  );
});
test("Hi request and message quotas cannot be bypassed through direct RPC", async () => {
  const id = await match();
  await assert.rejects(hi(), /HI_COOLDOWN/);
  await user(b, "select public.respond_to_hi($1,true)", [id]);
  await db.query(
    "insert into public.direct_messages(connection_id,sender_id,body,client_id) select $1,$2,'test',gen_random_uuid() from generate_series(1,60)",
    [id, a],
  );
  await assert.rejects(
    user(a, "select public.send_direct_message($1,$2,$3)", msg(id)),
    /MESSAGE_LIMIT/,
  );
  for (let i = 4; i <= 7; i++) {
    const uid = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    await db.query(
      "insert into auth.users values($1,'{}') on conflict do nothing",
      [uid],
    );
    await db.query(
      "insert into public.connections(member_a,member_b,initiator) values($1,$2,$1)",
      [a, uid],
    );
  }
  await assert.rejects(hi(), /DAILY_HI_LIMIT/);
});
test("message pagination has stable cursors, including identical timestamps", async () => {
  const id = await match();
  await user(b, "select public.respond_to_hi($1,true)", [id]);
  await db.query(
    "insert into public.direct_messages(connection_id,sender_id,body,client_id) select $1,$2,'history',gen_random_uuid() from generate_series(1,50)",
    [id, b],
  );
  const page = await user<{ id: string; created_at: string }>(
    a,
    "select * from public.get_direct_messages($1)",
    [id],
  );
  assert.equal(page.length, 40);
  const last = page[39];
  const next = await user<{ id: string }>(
    a,
    "select * from public.get_direct_messages($1,$2,$3)",
    [id, last.created_at, last.id],
  );
  assert.equal(next.length, 11);
  assert.equal(new Set([...page, ...next].map((m) => m.id)).size, 51);
});
