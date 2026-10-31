# Fresh Peep database rebuild

Prepared from the local `develop` application contracts on 2026-10-20. This is a reconstructed **full-platform schema**, not a recovery of the old database. Catalog compatibility is the first supported milestone; social and other sensitive workflows have explicit remaining work below. No users, catalog records, storage objects, credentials, projects, deployments, or integration settings are restored by these files.

## Files and application order

- `migrations/001_schema.sql`: complete baseline tables and constraints, including catalog, account, social, billing, creator/payout, ads/moderation, live feeds and predictions.
- `migrations/002_security.sql`: grants, RLS, auth signup trigger, entitlement helpers, views, indexes.
- `apply.sql`: applies both files in **one transaction**, aborting on any error.
- `environments/*.env.example`: separate, unfilled dev/prod client configuration templates.
- `tests/validate.mjs`: two independent, disposable in-memory PostgreSQL databases; never accepts a database URL.
- `tests/contracts.py`: checks the literal frontend/function table inventory against this baseline.

These files intentionally live outside `supabase/migrations`. Existing loose SQL and migrations are historical fragments, **not an installation sequence**. Do not replay them before or after this baseline. `apply.sql` refuses any public schema with existing tables. It is not an upgrade or a reset; rebuilding means a separate empty database. Repeating against the same database must fail safely. Future incremental migrations need their own version ledger after this reviewed baseline.

## Validation performed

PGlite 0.5.10 (PostgreSQL in WebAssembly), SHA-512 checked against npm package metadata, applied both migrations twice to independent empty memory databases. Tests cover anon/auth/admin, free/premium/preview rows, pending episodes, inherited show entitlement, guide and public-feed restrictions, own progress, cross-user writes, profile role/is_admin/access_tier escalation, protected subscription writes, paid expiry, RLS on every base table, and refusal to re-bootstrap. Auth is a minimal test stub; **real GoTrue, PostgREST, Storage and Realtime are not validated by PGlite**.

Reproduce in a scratch directory with Node and `@electric-sql/pglite@0.5.10` installed there (do not modify the app dependency tree):

```sh
PGLITE_MODULE=/absolute/scratch/node_modules/@electric-sql/pglite/dist/index.js node db/rebuild/tests/validate.mjs
python3 db/rebuild/tests/contracts.py
```

The harness supplies test-only auth roles/schema. Never apply `tests/bootstrap.sql` to Supabase. Test rows use `example.invalid`, exist only in memory and disappear when the test process exits. There is intentionally **no catalog seed**, no copied feed URLs, and no invented restored content.

## Development setup checklist (schema completed; remaining steps below)

1. Confirm the new account and explicitly chosen, empty **development** project. Record its project ID separately from production. Do not link the checkout to an old project or run `supabase db reset` against any existing stack.
2. Run the local tests. Review the schema and remaining compatibility gaps below. On the explicitly authorized new empty database, use `psql -X -v ON_ERROR_STOP=1 -f db/rebuild/apply.sql` with a securely supplied connection. Do not put a password or service key in source, shell history, logs, or frontend environment files. The same SQL can be reviewed as one transaction in the project's SQL editor; psql include directives are not SQL-editor syntax.
3. Confirm all public tables have RLS enabled; query as anon to verify no private rows appear. Catalog is initially empty and that is expected.
4. Configure Auth site/redirect URLs for localhost/dev only, email verification and test SMTP/provider deliberately. Sign up a new user through Auth; the trigger creates a default viewer profile without trusting user-supplied role metadata. Promote one verified auth UUID through a trusted SQL session: `UPDATE public.profiles SET role='admin', is_admin=true WHERE id='<verified-new-auth-uuid>';`. Never promote by an unverified email or client metadata.
5. Fill a private web env file from `environments/development.env.example`. The web configuration now requires an explicit environment and rejects legacy project URLs. Preserve the existing tvOS simulator, Keychain, gitignored Config and signing setup. When authorized, set the tvOS development URL and public key using its existing configuration mechanism. Do not place service-role keys in either client.
6. Add one **owned or licensed** free production-tier video, a show and explicitly approved episode, and an authorized active channel through the CMS. Add EPG rows referencing `channels.id`. Pending is the safe episode default: CMS currently needs explicit approval in its review UI. An empty HLS URL exercises browsing only, not playback.
7. Repeat the exact tvOS REST queries in `peep-tv/PeepTV/Services/SupabaseService.swift` for videos, shows, approved episodes, active channels, EPG and public feeds with the new anon key. Verify UUID video IDs and integer show/episode/channel IDs decode; test paging at 200 records and empty results. Test web browse/player, then sign in as two different viewers and an admin. Include hidden/premium/expired/private-feed negative cases. Never relax policies to resolve an empty catalog.
8. Verify profile creation, username/avatar updates and progress/rating/list upserts through actual PostgREST. Inspect returned errors rather than relying on UI toast messages. Set up media, functions and integrations in separate reviewed steps below.

## Separate production setup checklist (empty schema initialized only)

Use a different new project, distinct credentials, Auth URLs, storage, Cloudflare inputs, Stripe mode/account resources, webhooks and email settings. Apply the **identical** reviewed baseline to that empty project only after dev integration checks pass. No test identities, demo catalog, test subscriptions or raw dev data should be copied. `VITE_PEEP_ENV=production` is required; do not infer environment by comparison with an obsolete project ID. Review all `.env.local`/mode precedence before building. The templates do not configure the deployed site. Release, DNS, deployment, payment and webhook cutover require separate authorization. Record backup/PITR choices and new migrations before launch.

## Security decisions and compatibility work remaining

- All tables have RLS. Anon gets only entitled catalog rows, active public ad tags, and an explicit safe settings allowlist. Public catalog requires production visibility; privileged preview accounts may see their server-assigned tier. Premium needs a server-managed active subscription with future expiry, or an explicit comp plan with no expiry. No dev-wide RLS bypass exists. Catalog-only browsing omits premium rows rather than exposing their playback URLs.
- Episodes inherit parent show visibility and premium rules and must be approved. EPG inherits channel access. Feed playback URLs are exposed by a deliberately filtered definer view only when attached to an entitled active channel. Source host/ingest secrets stay private. RLS cannot revoke an already known external media URL: use signed delivery for premium media before adding it.
- Profiles are private to the owner/admin. A trigger rejects self-promotion even via upsert; no user metadata can assign entitlements. Broad email lookup at signup and public streamer profile reads will no longer work. Replace these with purpose-specific server checks/public profile projections, not broad profile grants. Blocked-user enforcement currently lives partly in the client and must move to a trusted auth/API enforcement point.
- Social tables are present, but **live_streams remains owner/admin read only** because its current `SELECT *` contract includes `stream_key`. Split secrets into a service-only table and migrate the dashboard/edge functions/public profile to safe projections before enabling public creator streams. Social chat, schedule, uploads, notifications and their Realtime behavior remain restricted/admin-managed pending that work. Anonymous viewer heartbeats are denied; add a rate-limited aggregate endpoint rather than public arbitrary writes. User viewer-heartbeats are owner scoped.
- `increment_view(text,text)` is defined with an allowlist, but service-only until a rate-limited endpoint exists. The current client call will be denied (its caller ignores errors). Counters will not increase from that client yet.
- Watch progress/list/ratings use `(user_id,content_id,content_type)` to match current upserts, with optional profile ownership checked. This is account-level progress; multiple viewer profiles cannot maintain separate progress until all clients change consistently. Ratings are -1/+1. Duration is text to match Swift; year is integer. All polymorphic content IDs are text.
- `movies` is a security-invoker compatibility view over `videos` for the old creator-dashboard function. Fix the function to use videos in a subsequent change. `ads` is intentionally absent: historical rename SQL is not a current contract; `vast_tags` is canonical. Music and access_grants have limited current contracts; their reconstructed fields require workflow verification.
- The CMS EPG editor still coerces UUID movie IDs with `Number(...)`. Fix that path to preserve text before scheduling a movie. (The ad editor keeps ids as text and picks titles by name.) A correct schema cannot repair IDs already destroyed in JavaScript.
- Carousel `environment` and `visibility_tier` are independent. Only production-environment shelves are public; test shelves stay admin-only. `stage` is retained as an explicit intermediate preview tier because code recognizes it.
- Creator payout formulas and referral fields have drifted; nullable legacy referral_code supports current watch-minute payouts. No payouts or historical balances are inferred. Audit log inserts are append-only for clients, but client-created entries are not a trustworthy tamper-proof accounting ledger.
- Prediction schema exists; bets have no client write policy. No real-money transactions, settlement automation, KYC or age-verification system is enabled. Market settlement UI still needs transactional consistency and immutable audit enforcement before use.
- Tables are reconstructed from checked-in SQL and current writes, not a canonical old schema dump. Dynamic payloads, optional fields, unseen triggers/indexes, business checks and older integrations may need follow-up migrations. Do not claim the entire production platform is integration-tested.

## Storage, Auth and external services (separate work)

No bucket is created by this baseline. Existing code names `content`, `peep-media`, and `avatars`, and uses public URLs. Decide the public-image vs private-media split first. Private/premium media must use private buckets and signed URLs; never mark a whole bucket public just to make playback work. Add admin-only content upload policies, owner-folder avatar policies with MIME/size limits, and moderated creator uploads. Storage object policies must be tested separately from catalog RLS. Existing files and Cloudflare assets are not in Git.

No Edge Functions are deployed. Review all 42 functions for JWT checks, role checks, environment-bound credentials and webhook signature handling before deploying them to dev. Configure Cloudflare Stream, Stripe **test mode**, Resend test delivery, Turnstile dev keys, and relay test routes independently. No old webhook URLs, live Stripe prices, production customer IDs, email recipients or relay inputs may be reused implicitly. Auth redirect lists, email templates/provider, password resets and initial admin enrollment require separate setup.

Realtime publications and Broadcast authorization are not enabled. Review safe table/row access before adding chat, notifications or market channels. EPG cron is not enabled; first verify authorized feed sources, timezone parsing, channel mapping and transactional replacement in `refresh-epg`, then configure a dev scheduler with secrets stored server-side. Never import arbitrary channel URLs as evidence of distribution rights.

## What cannot be recovered from this checkout

Original auth identities/passwords/sessions; user profiles, lists, ratings and watch history; catalog metadata/rights and schedules; creator referrals/payout history; subscriptions and their identity mapping; audit/moderation records; Storage objects; project secrets, cron/publication settings, OAuth/email provider configuration. Stripe/Cloudflare may retain separately recoverable records if their owners still have access, but no such access or recovery was attempted.

References used for policy design: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions and execution privileges](https://supabase.com/docs/guides/database/functions). Current repository contracts override stale prose in CLAUDE.md.

## Review hardening and real-Supabase validation

The revised baseline explicitly revokes inherited view grants on `public_live_feeds`
and `movies` before granting SELECT, and revokes inherited sequence privileges before
granting USAGE/SELECT to authenticated/service_role. Local validation now starts with
Supabase-style default ALL grants on tables/views/sequences and verifies client view
writes and sequence setval are denied.

`tests/real-supabase-rollback.sql` is for a single privileged SQL call bound to the new
**development** project only. It uses actual auth.users/auth.uid, local role/JWT claims,
synthetic identities and explicit negative bigint IDs, and ends in ROLLBACK. It tests
the Auth trigger, untrusted metadata, escalation/upserts, owner isolation, entitlement
expiry and view/sequence ACLs. It has passed locally with auth stubs; real Supabase
execution also passed on the new development project, as reported by the parent task. It does not test GoTrue signup/password/login/email delivery.

`tests/tvos-rest-smoke.mjs` is read-only and hardcodes the new dev origin. It matches
current tvOS REST query shapes and optionally uses a genuine dev user token for
viewer_profiles. Supply only the new public key through its documented environment
variable. No remote checks have been run locally. Empty arrays validate query routes,
not populated-model decoding, media playback, or REST entitlement isolation. SQL
rollback fixtures cannot be observed from independent REST connections; real API
fixture testing needs separate dev-only committed fixtures and cleanup authorization.

## Hardening v2: private helpers and caller-checked feeds

Apply `003_private_helpers.sql` transactionally **once** to an existing v1 baseline;
new databases apply 001, 002, 003 together via apply.sql. Keep `peep_private` outside
the Data API exposed-schema list. Its restricted executable helpers are available to
RLS through schema USAGE, not through public RPC endpoints. No anon/auth-executable
SECURITY DEFINER function remains in public. Existing policy dependencies follow
ALTER FUNCTION SET SCHEMA; string function bodies are explicitly updated.

`public_live_feeds` is now SECURITY INVOKER. Clients receive SELECT on only id,
cloudflare_hls_url, playback_status and enabled in live_feeds. Entitlement RLS limits
viewer rows to enabled feeds linked to active entitled channels. Source/ingest/admin
metadata has no client column grant. The CMS's two full-metadata reads now use
`admin_live_feeds()`, a public invoker wrapper over a private, explicitly admin-checked
function returning the same fields. Non-admin calls are denied. Install the matching
local CMS code with this migration before using its feeds UI. Service-owned edge
function reads are unchanged. No passphrase read access was added.

Tests now exercise both fresh and forward migration paths with inherited ALL grants,
metadata denial, admin RPC isolation, invoker-view properties and absence of exposed
client-callable definers. The real rollback script omits the anon JSON sub claim
entirely; empty sub strings are invalid UUIDs in real auth.uid(). Parent reported v1
real-role rollback tests and empty-catalog tvOS REST checks passed. The parent then
applied v2 hardening and reran the corrected tests successfully; see final status below.


## Verified handoff status — 2026-10-20

The parent task reported the following remote results after reviewing and applying
these exact artifacts. This local documentation task did not make remote changes.
The setup checklists above remain useful for future installs; **do not rerun the
fresh bootstrap or forward hardening on the already initialized projects**.

| Environment | Project ref | Verified state |
|---|---|---|
| Development | `cuwdyedmmnpklufduaho` | Baseline plus forward v2 hardening applied; corrected real Auth/RLS/ACL transactional rollback tests passed; guest tvOS REST smoke queries passed. |
| Production | `ffoiacnvcjlkgsazacrk` | Fresh baseline v2 applied to the separate empty database; 49 of 49 tables have RLS enabled. Production application workflows have not been validated. |

Both projects' Supabase security advisors reported **no ERROR or WARN**. The only
reported INFO is `live_feed_secrets` having RLS enabled with no policies, intentionally
denying client access. These advisor results do not establish production readiness.
The old projects and live website were left unchanged.

The Apple TV task configured its ignored `Local.xcconfig` with the new development
publishable key, built and launched the app, and confirmed successful home video/show
fetches. The empty catalog is expected. Xcode omitted custom generated metadata, so
that task additionally used a workspace-local `PeepTV-Local-Info.plist`. It reported
no tracked source changes. No key or token is recorded here; retain the ignored/local
configuration and existing simulator state. This proves development connectivity,
not media playback or populated catalog behavior.

### Work remaining before a platform launch

- Add owned/licensed catalog metadata and media, explicitly approved episodes, active
  authorized channels and guide data. Verify populated Swift decoding, pagination,
  thumbnails, playback and entitlement denial with real client sessions.
- Configure and test Storage buckets/policies and signed delivery for private/premium
  media; recover or re-upload assets only from separately authorized sources. No old
  assets, users, watch history, financial records or catalog rows were restored.
- Complete genuine Auth signup, email verification, password/reset, login/refresh,
  initial admin enrollment and cross-user API checks. Database trigger/role tests are
  not a substitute for these end-to-end flows.
- Review/deploy required Edge Functions and separately configure Cloudflare, Stripe,
  Resend, Turnstile and relay resources. Keep development resources and payment/email
  behavior isolated from production; verify webhook authorization and signatures.
- Resolve the documented social stream-key separation and safe public profile access,
  anonymous heartbeat/view counting, UUID coercion in CMS EPG/ad editors, and creator
  payout/prediction workflow gaps before enabling those features.
- Deliberately configure safe Realtime/Broadcast access and EPG scheduling. Decide
  backups/PITR, incremental migration tracking and operational recovery procedures.
- Validate the full web application and production configuration, then separately
  authorize deployment/cutover. Neither a deployed web change nor production platform
  readiness is implied by the completed empty-schema rebuild.
