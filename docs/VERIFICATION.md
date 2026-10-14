# Verification record

Verified locally and against the user's Supabase project during this implementation. This is a development verification record, not a production security certification.

## Passed

- Netlify Free project `nepeel` created and connected to GitHub `nepeel-com/homepage`, main commit `437f1b4`. Production deploy `6acec6b8c7e506de8a198cdc` published with both `capture` and scheduled `cleanup-media`. Public production and private Deploy Previews were saved with explicit user approval. The existing Supabase secret key is stored only in the Production context; other contexts are empty. The scheduled cleanup is registered for 03:00 UTC, but no manual deletion was invoked.
- Public Netlify smoke checks: `/` 200, GET `/api/capture` JSON 405, unauthenticated POST JSON 401, deliberately invalid bearer POST JSON 401, scheduled endpoint 403. The invalid-bearer check confirms runtime configuration reaches the Auth handler, not a valid member or administrator round trip. Browser rendered the guest feed and Hi without console errors.
- Spaceship DNS migrated: apex A `75.2.60.5`, `www` CNAME `nepeel.netlify.app`. Authoritative DNS and Cloudflare public resolver confirm both records. All existing MX/TXT rows compare unchanged, including Zoho MX priorities 10/20/30, verification, SPF and DKIM. Netlify reports HTTPS enabled with a Let's Encrypt certificate for both names. HTTPS requests return 200 from Netlify for the apex; `www` redirects to the apex. GET `/api/capture` returns 405 from Netlify. Existing browser DNS caches can temporarily retain the prior Vercel release. Evidence: `.qa/dns-before.txt`, `.qa/dns-after.txt`, `.qa/dns-netlify-saved.png`, `.qa/netlify-domain-https.png`.
- Full local `netlify build --offline` passed, including both function bundles. Latest camera foreground changes also passed iOS (708 modules) and Android (706 modules) Hermes exports, about 2.4 MB each, to `.qa/final-mobile-export`. These are JavaScript exports, not signed device builds.
- Realtime reconnect/foreground catch-up verified in a local browser harness using the production `useConnections` hook and a simulated transport: messages added during a CLOSED connection and inactive screen appeared after SUBSCRIBED/foreground without manual refresh; no console errors. Evidence: `.qa/dm-reconnect-verified.png`. This does not prove managed Supabase transport delivery.
- Camera now unmounts in the background and waits for a fresh `onCameraReady` after foregrounding. Generation guards discard an old capture/readiness callback. Native typecheck passes; physical camera lifecycle verification still requires a device build.
- GitHub source uploaded through the user's existing authenticated browser session without granting GitHub CLI access. Fetched remote `081f1bf` and compared its complete tree with local tested commit `45f9672`: identical. Removed the old tracked TypeScript cache through a recoverable Git commit. No `.env.local`, mobile `.env`, or server secret uploaded.
- Hi additive migration `202610140003_hi_connections.sql` applied to production. Live SQL: `protected_tables=5`, `client_can_insert_dm=false`, `anon_can_send=false`, `realtime_tables=2`. No synthetic member data or messages created on production.
- Custom SMTP was saved directly by the user. A dashboard reload retained Enable custom SMTP with host `smtp.zoho.com`; Save changes was disabled. The password was not read. Actual recipient delivery is not yet verified.
- 32 tests pass, with all four migrations included in SQL suites. Coverage adds account cascade/rollback, durable media cleanup, denial of deleted accounts holding old JWTs, same-user password reconfirmation, Auth/Storage failure handling, offline message catch-up and preservation of paginated conversations. Existing capture, matching, quotas, privacy and hosting boundary tests also pass.
- Migration `202610140004_account_cleanup.sql` applied to production. Live catalog result: `protected_tables=12`, `cleanup_rls=true`, `member_can_read_jobs=false`, `cleanup_trigger=true`. No real member data deleted. Evidence: `.qa/account-db-verified.png`.
- Web account deletion dialog at 390×844: no horizontal overflow (dialog 352px); DELETE alone leaves the action disabled without a password. This was a local component preview, not a live-account deletion test. Evidence: `.qa/account-mobile-preview.png`.
- Web/server production build and native typecheck pass. Updated iOS (708 modules) and Android (706 modules) Hermes exports pass, about 2.4 MB each.
- Hi web desktop and 390px mobile: no horizontal overflow, Korean/English switching, guest send opens authentication, no browser warnings/errors. Separate lazy-loaded Hi chunk is about 8 KB gzip (main app about 135 KB gzip).
- Expo native typecheck and iOS/Android Hermes exports pass with Hi screen. This does not replace physical-device or signed-app validation.
- Vercel account explicitly displays Hobby. The current production host is Netlify Free; Vercel Git auto-deployment is disabled. Older Vercel checks below are historical records, not the current production release.

- Domain configuration (2026-10-14): Supabase Site URL `https://nepeel.com`; redirect allowlist `https://nepeel.com`, `https://nepeel.com/`, `http://127.0.0.1:5173`. Saved in the authenticated dashboard.
- Vercel Production: six non-secret connection/identity settings saved for `nepeel-com/homepage`. Node 24.x, Vite, repository root, output `dist`; install command set to `npm ci`. Expo local/example and EAS production API URL use `https://nepeel.com`.
- Vercel production deployment `dpl_4uUj9p5niK6g4kmBs2SWePDzYtGV` is READY and aliased to `https://nepeel.com`. CLI deployed local source commit `79e2077`; production `npm ci`, TypeScript checks and Vite build passed. GET `/` returned 200 with the new SNS title; GET `/api/capture` returned the expected JSON 405; unauthenticated POST returned 401.
- Production browser: login/signup forms displayed, no console warnings/errors, no broken images or horizontal overflow at 1920px. No real account signup or confirmation email was triggered.
- With explicit user approval, the existing Supabase `service_role` key was saved only as the Vercel Production Secret `SUPABASE_SERVICE_ROLE_KEY`. The key was not printed or saved in source/local env files.
- Redeployed with the server key: `dpl_GHkUkCoLTbmLJCAztC2BJ4G2o9pZ` (local commit `57ea3f6`) is READY and aliased to `https://nepeel.com`. A deliberately invalid bearer token returns the expected 401 expired-login response, confirming the handler reaches Supabase Auth with the configured server client. No valid member credential or platform proof was used in this smoke check.
- Web + Vercel server TypeScript checks and Vite production build.
- Expo native TypeScript check.
- Expo SDK 57 final iOS and Android production JavaScript/Hermes exports (700 modules each), approximately 2.3 MB each. This is **not** a signed IPA/APK or physical device test.
- 13 automated tests using the actual SQL migrations on PGlite PostgreSQL: anonymous privacy, profile ownership, direct client post/storage upload denial, reaction ownership, private bookmarks, feed aggregation, nonce ownership/purpose/expiry/reuse, iOS counter rollback, challenge quota, verification attempt quota, payload binding, JPEG decoding/EXIF removal, invalid app attestations and Android verdict validation.
- Supabase public Auth settings responded HTTP 200: email signup enabled, email auto-confirm disabled.
- Authenticated dashboard SQL created the schema. Final live inspection: `sns_tables=9`, `rls_tables=9`, `photos_public=false`, `hardened_columns=2`, `member_can_claim=false`, `server_can_register=true`.
- Public-key-only request to member profiles now returns HTTP 401 / PostgreSQL `42501` (permission denied), rather than the initial missing-table error.
- Browser checks: sample search returns the matching image, photo details open/close, signup fields switch correctly, saved content requires membership, mobile navigation changes views, photos load, and mobile viewport has no horizontal overflow.

## Not yet verified / configured

- Retirement of the old Vercel environment and disabling legacy Supabase JWT API keys after migration. Netlify uses the existing modern secret key; the client uses the publishable key. Credential revocation requires the account owner's direct action.
- Apple Developer and Play Console identities/credentials; genuine iOS registration/assertion and Google integrity response.
- A real member's email confirmation and two-device end-to-end round trip. No fake members were inserted into the live project for screenshots or tests.
- Hi/DM UI with two live member sessions, background/foreground delivery on devices, largest Dynamic Type, screen reader testing, full-site localization and moderation operations. DB tests are local PGlite tests, not a claim of full managed Realtime end-to-end verification.
- Signed native builds, App Store/Play review, push notifications, blocked-user management, or moderation operations.
- Account deletion and native post report/delete are implemented and locally tested. Managed Auth/Storage end-to-end deletion and an actual scheduled cleanup execution remain unverified. The Netlify schedule is deployed. Do not delete a real member to demonstrate the feature.

## Dependency audit

Updated `sharp` to 0.35.5 and `@vercel/node` to 23.0.1. Ran non-breaking `npm audit fix`. At verification, full workspace audit still reports 31 findings (8 moderate, 23 high), largely propagated through Expo/Metro and Vercel build-tool dependencies. Root-only `--omit=dev --workspaces=false` still reports braces/micromatch; `npm ls braces --all` places them under Expo → Metro → metro-file-map.

No claim of a clean dependency audit is made. Do not apply the audit's forced downgrade to Expo 44 or mismatched React Native as a quick fix. Review upstream patches before release and keep developer servers restricted to localhost. AppIntegrity is an alpha Expo module; pin the lockfile and revalidate native attestation when upgrading.

## Boundaries

SQL unit tests stub the Supabase auth/storage schemas. They validate Postgres permissions and routines, not Supabase's entire managed Auth/Storage implementation. App verification tests cover rejection and request binding; valid platform proofs still require real devices. App attestation does not establish the truth of the photographed scene. Signed media links expire after five minutes and may be usable by a recipient during that interval.
