import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("account cascade queues files durably and revoked members cannot read with an old JWT", async () => {
  const db = new PGlite();
  const a = "00000000-0000-4000-8000-000000000001",
    b = "00000000-0000-4000-8000-000000000002";
  try {
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
    ])
      await db.exec(
        await readFile(
          new URL(`../supabase/migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    await db.exec(`insert into auth.users values('${a}','{}'),('${b}','{}');
      insert into public.posts(user_id,image_path,image_sha256,platform,captured_at) values
        ('${a}','${a}/a.jpg',repeat('a',64),'ios',now()),('${b}','${b}/b.jpg',repeat('b',64),'ios',now());
      insert into storage.objects(bucket_id,name) select 'captures',image_path from public.posts;`);
    await db.exec(`begin; delete from auth.users where id='${a}'; rollback;`);
    assert.equal(
      (await db.query("select * from public.media_cleanup_jobs")).rows.length,
      0,
      "rolled-back deletion must not queue live media",
    );
    await db.exec(`delete from auth.users where id='${a}'`);
    assert.equal(
      (await db.query("select image_path from public.media_cleanup_jobs")).rows
        .length,
      1,
    );
    assert.deepEqual(
      (await db.query("select user_id from public.posts")).rows,
      [{ user_id: b }],
    );
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`,
    );
    for (const table of ["public.profiles", "public.posts", "storage.objects"])
      assert.equal(
        (await db.query(`select * from ${table}`)).rows.length,
        0,
        `${table} denies a deleted member`,
      );
    await assert.rejects(
      db.query("select * from public.media_cleanup_jobs"),
      /permission denied/,
    );
    await db.exec(`select set_config('request.jwt.claim.sub','${b}',false)`);
    assert.equal(
      (await db.query("select * from public.posts")).rows.length,
      1,
      "remaining members retain access",
    );
    assert.equal(
      (await db.query("select * from storage.objects")).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
