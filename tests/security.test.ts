import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import sharp from "sharp";
import { capturePayload } from "../shared/types.js";
import {
  decodePhoto,
  sha256,
  validateAndroidVerdict,
} from "../server/validation.js";
import { iosAssertion, iosRegistration } from "../server/integrity.js";

const db = new PGlite();
const alice = "00000000-0000-4000-8000-000000000001";
const bob = "00000000-0000-4000-8000-000000000002";
const post = "00000000-0000-4000-8000-000000000003";
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated, service_role;
    grant all on storage.objects to anon, authenticated, service_role;`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610140001_nepeel.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610140002_capture_hardening.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const file of ["202610140003_hi_connections.sql", "202610140004_account_cleanup.sql", "202610140005_connection_unblock.sql"])
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  await db.exec(`insert into auth.users values ('${alice}','{"display_name":"Alice"}'),('${bob}','{"display_name":"Bob"}');
    insert into public.posts(id,user_id,image_path,image_sha256,caption,platform,captured_at) values('${post}','${alice}','${alice}/${post}.jpg',repeat('a',64),'a real moment','ios',now());
    insert into storage.objects(bucket_id,name) values('captures','${alice}/${post}.jpg');`);
});
after(async () => {
  await db.close();
});
async function asUser(user: string, sql: string) {
  try {
    return await db.exec(
      `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${user}',true); ${sql}; commit;`,
    );
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
test("anonymous users cannot read member profiles or photos", async () => {
  await assert.rejects(
    db.exec("set role anon; select * from public.posts"),
    /permission denied/,
  );
  await db.exec("reset role");
  const result = await db.query("set role anon;");
  assert.ok(result);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
  await db.exec("reset role");
});
test("signup creates own profile; users cannot impersonate another profile", async () => {
  const result = await asUser(
    alice,
    `update public.profiles set display_name='Hijacked' where id='${bob}' returning id`,
  );
  assert.equal(result[3].rows.length, 0);
  assert.equal(
    (
      await db.query<{ display_name: string }>(
        `select display_name from public.profiles where id='${bob}'`,
      )
    ).rows[0].display_name,
    "Bob",
  );
  await assert.rejects(
    asUser(
      alice,
      `update public.profiles set username='spoofed' where id='${alice}'`,
    ),
    /permission denied/,
  );
});
test("user tokens cannot insert posts or upload files directly", async () => {
  await assert.rejects(
    asUser(
      alice,
      `insert into public.posts(user_id,image_path,image_sha256,caption,platform,captured_at) values('${alice}','fake.jpg',repeat('a',64),'','ios',now())`,
    ),
    /permission denied/,
  );
  await assert.rejects(
    asUser(
      alice,
      `insert into storage.objects(bucket_id,name) values('captures','fake.jpg')`,
    ),
    /row-level security/,
  );
  await assert.rejects(
    asUser(alice, `select * from public.device_keys`),
    /permission denied/,
  );
  await assert.rejects(
    asUser(alice, `select public.claim_capture(gen_random_uuid(),'${alice}')`),
    /permission denied/,
  );
});
test("likes and comments must belong to the authenticated author", async () => {
  await assert.rejects(
    asUser(bob, `insert into public.likes values('${alice}','${post}')`),
    /row-level security/,
  );
  await assert.rejects(
    asUser(
      bob,
      `insert into public.comments(user_id,post_id,body) values('${alice}','${post}','forged')`,
    ),
    /row-level security/,
  );
  await asUser(
    bob,
    `insert into public.likes values('${bob}','${post}'); insert into public.comments(user_id,post_id,body) values('${bob}','${post}','hello')`,
  );
});
test("bookmarks stay private and feed aggregates reflect stored actions", async () => {
  await asUser(
    alice,
    `insert into public.bookmarks values('${alice}','${post}')`,
  );
  const bookmarks = await asUser(bob, "select * from public.bookmarks");
  assert.equal(bookmarks[3].rows.length, 0);
  const result = await asUser(bob, `select * from public.get_feed()`);
  const row = result[3].rows[0] as {
    liked: boolean;
    saved: boolean;
    like_count: number;
    comment_count: number;
  };
  assert.equal(row.liked, true);
  assert.equal(row.saved, false);
  assert.equal(Number(row.like_count), 1);
  assert.equal(Number(row.comment_count), 1);
});
test("a challenge is account-bound, purpose-bound, expires, and is single use", async () => {
  const {
    rows: [c],
  } = await db.query<{ id: string }>(
    `select id from public.issue_challenge('${alice}','nonce','capture')`,
  );
  await assert.rejects(
    db.query(`select public.claim_capture('${c.id}','${bob}')`),
    /expired or already used/,
  );
  await db.query(`select public.claim_capture('${c.id}','${alice}')`);
  await assert.rejects(
    db.query(`select public.claim_capture('${c.id}','${alice}')`),
    /expired or already used/,
  );
  const {
    rows: [expired],
  } = await db.query<{ id: string }>(
    `select id from public.issue_challenge('${alice}','nonce','capture')`,
  );
  await db.exec(
    `update public.capture_challenges set expires_at=now()-interval '1 second' where id='${expired.id}'`,
  );
  await assert.rejects(
    db.query(`select public.claim_capture('${expired.id}','${alice}')`),
    /expired or already used/,
  );
  const {
    rows: [registration],
  } = await db.query<{ id: string }>(
    `select id from public.issue_challenge('${alice}','nonce','register')`,
  );
  await assert.rejects(
    db.query(`select public.claim_capture('${registration.id}','${alice}')`),
    /expired or already used/,
  );
});
test("iOS counter replay fails atomically without consuming a fresh challenge", async () => {
  await db.exec(
    `insert into public.device_keys(key_id,user_id,public_key,sign_count) values('key','${alice}','public',4)`,
  );
  const {
    rows: [c],
  } = await db.query<{ id: string }>(
    `select id from public.issue_challenge('${alice}','nonce','capture')`,
  );
  await assert.rejects(
    db.query(`select public.claim_capture('${c.id}','${alice}','key',3,5)`),
    /Invalid assertion counter/,
  );
  await db.query(`select public.claim_capture('${c.id}','${alice}','key',4,5)`);
  assert.equal(
    Number(
      (
        await db.query<{ sign_count: number }>(
          `select sign_count from public.device_keys where key_id='key'`,
        )
      ).rows[0].sign_count,
    ),
    5,
  );
});
test("server challenge issuance is rate-limited per account", async () => {
  for (let i = 0; i < 12; i++)
    await db.query(
      `select public.issue_challenge('${bob}','nonce-${i}','capture')`,
    );
  await assert.rejects(
    db.query(`select public.issue_challenge('${bob}','nonce-extra','capture')`),
    /Too many capture requests/,
  );
});
test("verification attempts are capped, including invalid proofs", async () => {
  const {
    rows: [c],
  } = await db.query<{ id: string }>(
    `select id from public.issue_challenge('${alice}','attempt-nonce','capture')`,
  );
  for (let i = 0; i < 3; i++)
    await db.query(
      `select * from public.begin_capture_attempt('${c.id}','${alice}','capture')`,
    );
  await assert.rejects(
    db.query(
      `select * from public.begin_capture_attempt('${c.id}','${alice}','capture')`,
    ),
    /too many attempts/,
  );
});
test("signed payload changes for any altered photo, caption, account, or challenge", () => {
  const c = { id: "challenge", nonce: "random", expires_at: "" };
  const original = capturePayload(alice, c, "hash", "caption");
  assert.notEqual(original, capturePayload(alice, c, "other-hash", "caption"));
  assert.notEqual(original, capturePayload(alice, c, "hash", "other-caption"));
  assert.notEqual(original, capturePayload(bob, c, "hash", "caption"));
  assert.notEqual(
    original,
    capturePayload(alice, { ...c, nonce: "other" }, "hash", "caption"),
  );
});
test("invalid image formats are rejected; decoded JPEG is hashed and EXIF is removed", async () => {
  await assert.rejects(decodePhoto("arbitrary text"));
  await assert.rejects(decodePhoto(Buffer.from("<svg />").toString("base64")));
  const jpeg = await sharp({
    create: { width: 128, height: 128, channels: 3, background: "#dddddd" },
  })
    .jpeg()
    .withMetadata()
    .toBuffer();
  const result = await decodePhoto(jpeg.toString("base64"));
  assert.equal(result.hash, sha256(jpeg));
  assert.equal((await sharp(result.clean).metadata()).exif, undefined);
});
test("Play Integrity verifies request binding, age, signing certificate, and device", () => {
  const now = Date.now();
  const verdict = {
    requestDetails: {
      requestPackageName: "com.nepeel.app",
      requestHash: "hash",
      timestampMillis: String(now),
    },
    appIntegrity: {
      appRecognitionVerdict: "PLAY_RECOGNIZED",
      packageName: "com.nepeel.app",
      certificateSha256Digest: ["cert"],
    },
    deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"] },
    accountDetails: { appLicensingVerdict: "LICENSED" },
  };
  validateAndroidVerdict(verdict, "hash", "com.nepeel.app", ["cert"], now);
  assert.throws(() =>
    validateAndroidVerdict(
      verdict,
      "tampered",
      "com.nepeel.app",
      ["cert"],
      now,
    ),
  );
  assert.throws(() =>
    validateAndroidVerdict(verdict, "hash", "com.nepeel.app", ["wrong"], now),
  );
  assert.throws(() =>
    validateAndroidVerdict(
      verdict,
      "hash",
      "com.nepeel.app",
      ["cert"],
      now + 181000,
    ),
  );
  assert.throws(() =>
    validateAndroidVerdict(
      { ...verdict, deviceIntegrity: {} },
      "hash",
      "com.nepeel.app",
      ["cert"],
      now,
    ),
  );
});
test("iOS verification fails closed with absent settings and forged attestations", () => {
  const oldTeam = process.env.APPLE_TEAM_ID;
  const oldBundle = process.env.IOS_BUNDLE_ID;
  try {
    delete process.env.APPLE_TEAM_ID;
    delete process.env.IOS_BUNDLE_ID;
    assert.throws(() => iosRegistration("ZmFrZQ==", "key", "nonce"), /준비 중/);
    process.env.APPLE_TEAM_ID = "TESTTEAMID";
    process.env.IOS_BUNDLE_ID = "com.nepeel.app";
    assert.throws(
      () => iosRegistration("ZmFrZQ==", "key", "nonce"),
      /확인할 수 없습니다/,
    );
    assert.throws(
      () => iosAssertion("ZmFrZQ==", "payload", "key", 0),
      /일치하지 않습니다/,
    );
  } finally {
    if (oldTeam) process.env.APPLE_TEAM_ID = oldTeam;
    else delete process.env.APPLE_TEAM_ID;
    if (oldBundle) process.env.IOS_BUNDLE_ID = oldBundle;
    else delete process.env.IOS_BUNDLE_ID;
  }
});
