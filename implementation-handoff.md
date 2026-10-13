# Implementation handoff

Hi extension: read DESIGN.md and shared/connect.ts. Preserve ink/paper/lime tokens, labelled 16px controls and responsive navigation with at most five mobile items. The first artifact must prove opt-in matching, one fixed Hi request, accept/decline, private DM, blocking/reporting and honest empty/error states. No extra image assets. Verify SQL authorization before applying the new additive migration; do not rerun initial migrations.

Source is implemented in `src` (web), `mobile` (Expo), `shared` (types and queries), `api` + `server` (Vercel capture verifier), and `supabase/migrations` (database/Storage boundaries).

Production web/API origin is `https://nepeel.com`, connected to Vercel `nepeel-com/homepage`. Supabase email redirect configuration and Vercel's non-secret Production environment values are saved. Expo's production API origin is pinned in `mobile/eas.json`.

The SNS source and server credential are live in Vercel deployment `dpl_GHkUkCoLTbmLJCAztC2BJ4G2o9pZ`, deployed from local commit `57ea3f6` via CLI. GitHub synchronization remains blocked by the existing Git account's write permission (HTTP 403). The prepared checkout is `.qa/deploy-homepage`, and the upload package is `.qa/nepeel-sns-github.zip`. Do not redeploy the old GitHub source over the SNS release.

The project URL and public key supplied by the user are configured locally, excluded from Git. Both SQL migrations were applied to Supabase project `bvigbszjuviqjklrrqyb`. Do not rerun initial migrations there. Do not fetch or print server credentials into chat; configure them in the deployment environment.

Run `npm run build`, `npm test`, `npm run typecheck:mobile`; export native bundles from `mobile` with `npx expo export --platform all`. In this workspace prefix shell commands with `rtk proxy`. See `docs/VERIFICATION.md` for observed results and what still needs devices/credentials.

The Supabase server credential is configured. Before enabling publication, complete the Apple/Google server environment and App Attest/Play Integrity registration. Use production identities with the `production` EAS profile. Keep all development attestation keys and environments isolated from production. Never add a client header, shared client secret, or ‘development bypass’ that skips server verification.

Follow `README.md` for GitHub/Vercel folder layout and email redirect URLs. Root TypeScript build includes web and server; native has its own TypeScript configuration. Avoid importing Node verification code into web/shared/native modules.
