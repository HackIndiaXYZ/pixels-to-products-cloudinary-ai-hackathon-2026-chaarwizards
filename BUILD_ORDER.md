# Build Order

**Purpose:** Execution plan for an AI coding agent (or a team) to implement the platform from an empty repository.
**Read first:** `PRD.md` (what), `ARCHITECTURE.md` (how), `AGENTS.md` (rules).

Each phase has a **gate** — a concrete, checkable condition. Do not start the next phase until the current gate passes. Phases marked ⬛ can run in parallel with the one after them.

---

## Current State

**Update this table at the end of every session.** It is the first thing to read
and the first thing to update — it exists so a fresh session never re-derives
where the work stopped.

| # | Phase | Status | Gate | Notes |
|---|---|---|---|---|
| 0 | Monorepo Scaffold | ✅ done | ✅ passed (local) | pnpm+turbo workspace, 6 packages, TS strict, ESLint flat+Prettier, ruff/mypy/black, dashboard (React19+Vite) renders `CldImage`, CI skeleton. Committed on `main` as `d06913c`. |
| 1 | Database | 🟨 implemented | ✅ green (local) on `phase/1` | 13 migrations + 5 SQL test files + concurrency check. Invariant audit (AGENTS.md §3) run and its blocking findings fixed: `enable_signup=false` in `config.toml` (§3.10), `BEFORE DELETE` guard on `assets` (§3.1 — DELETE was unprotected), `change_events.model_version NOT NULL` (§3.2 — metric had no enforced provenance); plus `model_registry`/`sync_state` documented in `DATABASE_SCHEMA.md` (§8) and `test_helpers` EXECUTE revoked from client roles. Gate: `supabase db reset` applies all 13 from scratch; `supabase test db` = **72/72** pgTAP across 5 files (RLS + partition RLS, evidence immutability incl. DELETE + `cloudinary_created_at`, audit chain, schema completeness); concurrency green. Working tree only — not committed (owned by `/commit`). |
| 2 | Shared Package | 🟨 implemented | 🟨 green (local) on `phase/2` — 1 cross-language item BLOCKED on Phase 6 | `packages/shared`: RFC 8785 JCS canonicalizer + `sha256Canonical`, Ed25519 signing-payload builder + verify, domain Zod schemas + inferred types, state enums, `{data,error}` envelope + typed `ApiError` codes. 64 vitest tests pass (canonicalize/hash/signing/schemas/envelope/fixtures). Invariant audit (AGENTS.md §3) run and its findings fixed: signing payload now encodes for lossless re-derivation from stored columns — `captured_at_ms` epoch-ms integer (not ISO string) vs `device_capture_timestamp` (§3.8), `lat_e7`/`lon_e7` integer E7 coords (not floats) vs `gps_point` GEOGRAPHY (§3.8), `phase` constrained to `before`/`after` matching the `assets.phase` CHECK (§8), `device_monotonic_ms` added to the signed payload per `DATABASE_SCHEMA.md` (§3.7); added a round-trip re-derivation test. `DATABASE_SCHEMA.md` updated with the encoding contract. Cross-language JCS fixture at `packages/shared/fixtures/jcs-cross-language.json` for the Phase 6 Python port to assert against. No `any` / non-null assertion in src. Working tree only — not committed (owned by `/commit`). |
| 3 | API: Core | 🟨 implemented | 🟨 green (local) on `phase/3` — 2 items PARTIAL/deferred (quota reconciliation, live DB/Redis e2e) | `apps/api` Fastify app wired through injectable ports (auth/db/cloudinary/queue/routes). Ships: Supabase JWT verify + request-scoped vs service-role clients; project CRUD incl. recursive tree + config update; Cloudinary webhook ingest (SDK signature verify, org_id derived from the **signed** project_id not the body, byte re-hash, JCS EXIF re-hash, Ed25519 verify, quarantine-on-fail, idempotent upsert + audit append); delivery URLs (`original-url` authenticated+auth_token, `derivative-url` signed) resolving `public_id` by `asset_id` under RLS with a client-supplied `public_id` rejected; transformation allowlist (422 on anything outside named transforms + safe delivery params); 120s HS256 internal ML JWT; opaque-cursor pagination (limit default 20, clamp 100); per-user rate limits per api-contracts §7 (429 + Retry-After); org provisioning (`platform_admin` only, single-use 72h hashed invite, no public signup); typed errors + `request_id` + redacted Pino logs. **48 vitest tests pass** (lint/typecheck/build clean). Gate integration tests run against in-memory port fakes that mirror RLS org-scoping; true DB-level RLS is proven by the Phase 1 pgTAP suite. **PARTIAL:** quota — the 507 enforcement guard exists + tested, but nightly `bytes_used` recomputation is deferred to the Phase 5 Cloudinary reconciliation job (its data source; `assets` has no byte-size column and the API has no synchronous upload surface). **BLOCKED:** a live end-to-end against Supabase+Redis (Redis not installed in this env). Working tree only — not committed (owned by `/commit`). |
| 4 | Capture App | 🟨 implemented | 🟨 green (local) on `phase/4` — logic + runnable Expo app; **built, installed & LAUNCHED on an Android emulator — picker→camera→queue UI verified via screenshot**; Gradle `BUILD SUCCESSFUL`, Android bundle 853 modules, bridgeless JS running; 3 device tests + hardware-Keystore §8 decision still BLOCKED (need a physical phone) | Platform-agnostic capture pipeline behind injectable ports (`apps/capture-app/src/ports.ts`), mirroring the Phase 3 ports+fakes pattern: EXIF freeze allowlist + `exif_hash` byte-identical to the server JCS re-hash (`exif.ts`); streamed chunked SHA-256 that never loads a file whole, proven bounded on a synthetic 200 MB file (`hashing.ts`); Ed25519 signing with **honest `signature_tier`** — fallback is `server`, never relabelled `device` (`signing.ts`, §8); GPS accuracy warn/block gating + E7 encoding (`gps.ts`); hierarchical project picker with two-level observation-type inheritance (`projects.ts`); MMKV-backed offline queue with a strict state machine — `rejected` terminal + never re-attempted, interrupted → resumable `queued` never `confirmed`, `upload_started_at` stamped before the attempt (§3.7), restart-safe (`queue.ts`); resumable sync engine (`sync.ts`); 30 s video cap + keyframe hints + thumbnail (`video.ts`); capture orchestrator wiring it all, uploading only frozen EXIF so the server re-hash matches (`capture.ts`). `pnpm --filter @impact/capture-app test` = **59/59**; `lint`/`typecheck`/`build` clean; secrets grep clean; no `EXPO_PUBLIC_*` secret. **BLOCKED (needs user review):** the 3 device tests (airplane-mode 3-photo sync, kill/relaunch queue survival, post-signing caption edit) and the native-module/UI binding of each port (`expo-camera`, `expo-location`, `@react-native-community/netinfo`, `react-native-mmkv`, `expo-background-fetch`) — no Expo runtime/device in this env. **§8 decision for the user:** whether a hardware Keystore/Secure-Enclave-wrapped Ed25519 key is achievable on the target device; until confirmed, captures honestly report `signature_tier='server'`. Marked implemented, not passed — passing is the user's call after reviewing the branch. Working tree only — not committed (owned by `/commit`). |
| 5 | Cloudinary Pipeline | ⬜ not started | — | **START here: wire capture app to real `/v1/projects` (replace DEV seed, §3.4 JWT-derived org).** Confirm Cloudinary Free plan allows generative transforms. Blocked on user input: budget cap. |
| 6 | ML Service | ⬜ not started | — | Blocked on model weights + FFmpeg |
| 7 | Pairing & Change Events | ⬜ not started | — | |
| 8 | Dashboard Core | ⬜ not started | — | Realtime check deferred to user. |
| 9 | Reports | ⬜ not started | — | |
| 10 | Audit & Integrity Surfacing | ⬜ not started | — | 5-minute manual audit deferred to user. |
| 11 | Hardening & Release | ⬜ not started | — | Gates on the 9 criteria in `docs/architecture/MVP_EXIT_CRITERIA.md`. |

**Last updated:** 2026-09-28 · Phase 4 Capture App **implemented** on branch `phase/4` (not committed; owned by `/commit`), now with a **runnable Expo app layer** in addition to the platform-agnostic logic. Logic (unchanged behaviour, tests still 59/59): EXIF freeze + JCS `exif_hash`, streamed chunked SHA-256 (default hasher switched to pure-JS `@noble/hashes` so it runs under Node *and* React Native — digest byte-identical), honest Ed25519 `signature_tier` (`server` fallback, never relabelled `device`, §8), GPS gating + E7, hierarchical picker with inheritance, MMKV offline queue (`rejected` terminal, interrupted→resumable, `upload_started_at` before attempt §3.7, restart-safe), resumable sync, 30 s video cap. **Added on this branch:** Expo SDK 52 scaffold (`app.json`, `App.tsx`, `babel.config.js`, `metro.config.js`, root `index.ts`); native adapters for every port under `src/native/` (chunked `expo-file-system` reader, `@noble` streaming hasher, EXIF, `@noble/ed25519`+`expo-secure-store` signer, `react-native-mmkv` store, NetInfo monitor, device clock, `expo-location`, unsigned-preset Cloudinary uploader, runtime assembly, `expo-background-fetch`+NetInfo sync triggers); screens (`ProjectPickerScreen`, `CameraScreen` front/back + 30 s video, `QueueScreen`); tsconfig split (`tsconfig.lib.json` Node/vitest + `tsconfig.app.json` RN/JSX); `android/`/`ios/` gitignored (Continuous Native Generation). Local gate green: **test 59/59, lint, typecheck (lib), typecheck:app (RN), build** all clean; secrets grep clean; no `EXPO_PUBLIC_*` secret. **NEW BLOCKER — NOW RESOLVED & PROVEN:** the app previously could not Metro-bundle because `@impact/shared` statically imported `node:crypto`/`Buffer`. Fixed with a clean, non-breaking split of `@impact/shared` (Phase-2 code, edited here on `phase/4` — flag for your sync): (1) `hash.ts` `sha256Canonical` now uses pure-JS `@noble/hashes` (byte-identical to `node:crypto`); (2) `signing.ts` split into pure `signing-payload.ts` (`buildSigningPayload`, schemas, types — no `node:crypto`) + `signing.ts` (node Ed25519 `sign`/`verify`, re-exports the payload surface so the `.` barrel is unchanged for the API); (3) new pure `rn.ts` barrel + package `exports` `"./rn"`; the capture app imports `@impact/shared/rn` and verifies locally with `@noble/ed25519` instead of the node `verifyPayload`. **Non-breaking confirmed:** `@impact/shared` **64/64**, `@impact/api` **48/48**, `@impact/capture-app` **59/59** all still green; all four typechecks + lints clean. Device-bundle proof: `npx expo export --platform android` → `Android Bundled … (735 modules)`, exit 0. Two supporting config changes on this branch: root `.npmrc` gained `node-linker=hoisted` (Expo+pnpm requirement — **workspace-wide, flag for sync**) and `apps/capture-app/metro.config.js` maps TS `.js` ESM imports → source and enables package `exports`. **Still BLOCKED (needs a device / user review):** 3 device tests (airplane-mode 3-photo sync, kill/relaunch queue survival, post-signing caption edit) + hardware Keystore/Secure-Enclave Ed25519 (§8; until confirmed, `signature_tier='server'`). Marked implemented, not passed. Phases 0/2 (dependencies) confirmed present on `main`.

**Phase 4 emulator run (this session):** the app was built and run end-to-end on an Android emulator. `npx expo run:android` → Gradle `BUILD SUCCESSFUL in 6m21s` → APK installed → Metro `Android Bundled … (853 modules)` → app launched in bridgeless mode. A screenshot confirms the live UI: the **Camera** screen (emulator's simulated camera feed) with Flip/Photo/Video controls and the Picker·Camera·Queue tab bar — i.e. picker→camera→queue all render and navigate. Added on this branch to make the run possible without a backend: a **DEV-only seed project list** in `App.tsx` (used only when `EXPO_PUBLIC_API_URL` is unset; the real `/v1/projects` fetch is untouched) and `apps/capture-app/.env.local` (dummy Cloudinary creds, gitignored — **not committed**). Toolchain (JDK 17, Android SDK/AVD, emulator lib shims) was installed under `$HOME`, outside the repo. Log noise seen and confirmed benign: the `@noble/hashes/crypto.js` exports WARN (falls back fine) and a `react-native-web` web-bundle failure (web is not a target). **What this proves:** the app builds, bundles, launches, and the capture→sign→hash→queue pipeline runs on-device UI. **What it does NOT prove (still needs a physical phone):** real camera bytes, real GPS accuracy, hardware Keystore (`signature_tier='device'`), and the 3 deferred device tests — the emulator's fake camera / mock GPS / software signer cannot cover these.

**Phase 5 START carry-over (per user):** wire the capture app to the **real API** — replace the DEV seed with the live `GET /v1/projects` (resolving `org_id`/auth from the verified Supabase JWT, not env/body per §3.4) and point `EXPO_PUBLIC_API_URL` at a running `@impact/api`. This is the first task to pick up when Phase 5 begins.
<!-- Prior (Phase 3): API core implemented on branch phase/3 — see git history for the full note. -->
**Blocked on user input:** generative transform budget cap · Cloudinary Free-plan generative availability · Phase 4 hardware Keystore/Secure-Enclave Ed25519 feasibility on the target device (§8) · **Phase 4 3 device tests (need a physical device)**
**Not yet done:** CI (`.github/workflows/ci.yml`) not yet executed on a real push · Phase 1 not yet committed (owned by `/commit`) · Phase 2 cross-language JCS parity awaits the Phase 6 Python port

### Carry-over decisions

- **No `org_members` table.** `org_id` + `role` are written into Supabase
`app_metadata` by the platform admin at invite redemption, via
`auth.admin.updateUserById()`. `app_metadata` is server-controlled and not
user-writable, so the claim cannot be tampered with. The spec's RLS reads
`auth.jwt() ->> 'org_id'` directly and never subqueries a membership table, so a
join table is unnecessary while each user has exactly one org. Revisit only if a
user must belong to two orgs simultaneously.
- **`invite_tokens` is now in `DATABASE_SCHEMA.md`** (§Invite Tokens) with
address binding via `email`, `token_hash`, `expires_at`, `used_at`, RLS, and a
non-org-scoped redeem-by-hash policy. No Phase 1 work remains here.
- **`ARCHITECTURE.md:405` is corrected.** It no longer requires a Custom Access
Token Hook. No Phase 1 work remains here.

---

## Phase 0 — Monorepo Scaffold

**Depends on:** nothing
**Goal:** A running empty workspace with tooling, so every later phase has a place to land.

| Task | Detail |
|------|--------|
| Init pnpm workspace | `pnpm-workspace.yaml` covering `apps/*`, `packages/*` |
| Turborepo | `turbo.json` with `build`, `lint`, `typecheck`, `test`, `dev` pipelines |
| Base TS config | `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, ES2022) |
| Create 6 packages | `apps/api`, `apps/ml-service`, `apps/capture-app`, `apps/dashboard`, `packages/shared`, `packages/ui-components` |
| Node + Python toolchain | `.nvmrc` pinning `20.19+`, `pyproject.toml` at ML service, `ruff` + `mypy` config |
| Lint + format | ESLint flat config + Prettier; `ruff` + `black` for Python |
| Env contract | `.env.example` per service listing every variable with a comment; no real values |
| CI skeleton | `.github/workflows/ci.yml` running lint/typecheck/test across the workspace |
| `.gitignore` | node_modules, dist, .expo, .env*, ml artifacts, *.pt, __pycache__ |

### Scaffolding the dashboard

Use Cloudinary's official starter kit rather than hand-rolling it. `create-cloudinary-react` is
v1.0.0 (stable) and generates React 19 + Vite + TypeScript, which matches `ARCHITECTURE.md` §3.5.

```bash
npx create-cloudinary-react@latest apps/dashboard
```

The CLI is **interactive** (`inquirer`). Either run it yourself, or reproduce its output by hand:

| From the kit | Then add |
|---|---|
| `src/cloudinary/config.ts` (`cld` instance) | `@tanstack/react-query` |
| `src/cloudinary/UploadWidget.tsx` | `maplibre-gl` |
| `.env.example` with `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` |
| `.cursor/mcp.json` (Cloudinary MCP servers) | feature folders per `docs/architecture/FRONTEND_ARCHITECTURE.md` |
| `.cursorrules` (Cloudinary SDK patterns) | delete the demo `App.tsx` content |

**Do not use `create-cloudinary-next`** — it is `1.0.0-beta.4` and Next.js conflicts with the
documented Vite stack.

Install the server-side SDK separately, and use **v2**:

```bash
pnpm add cloudinary        # apps/api       → v2: import { v2 as cloudinary }
pip install cloudinary     # apps/ml-service
```

**Gate**
- `pnpm install` succeeds
- `pnpm lint && pnpm typecheck && pnpm test` pass across all 6 packages
- `turbo build` succeeds for all 6 packages
- `apps/dashboard` dev server boots with no console error and renders a `CldImage`
- No file in `apps/dashboard` references `CLOUDINARY_API_SECRET`
- CI is green on the initial commit
- **Task completeness.** Every row of this phase's task table above is `DONE`, with the implementing file named. A passing gate does not imply a complete phase, because a gate only tests what it names. Any `PARTIAL`, `MISSING`, or `BLOCKED` row blocks `/commit`.

---

## Phase 1 — Database

**Depends on:** Phase 0
**Goal:** Every table, constraint, and policy exists and is enforced. This is the foundation of the integrity story, so it comes before any service code.

| Task | Detail |
|------|--------|
| Migrations | `supabase/migrations/` — the 10 tables in `docs/architecture/DATABASE_SCHEMA.md`: `orgs`, `invite_tokens`, `projects`, `assets`, `asset_derivatives`, `observations`, `change_events`, `evidence_packages`, `report_manifest_entries`, `report_templates`; plus `audit_logs`, `model_registry`, `sync_state`. Gate item 10 asserts each one exists in `information_schema` — the task list and the gate must not drift. |
| PostGIS | extension, `gps_point geography(Point,4326)`, GIST index |
| Asset integrity columns | `sha256_hash`, `exif_hash`, `capture_signature`, `device_capture_timestamp`, `device_monotonic_ms`, `device_public_key`, `upload_started_at`, `server_received_at`, `cloudinary_created_at`, `verification`, `signature_tier` |
| Derivative lineage | `asset_derivatives` with `parent_asset_id`, `transformation`, `public_id`, `is_generative` |
| RLS | policy on all tables. Every `FOR UPDATE`/`FOR ALL` policy needs **both** `USING` and `WITH CHECK`. **No policy anywhere may use `WITH CHECK (true)`.** No `INSERT` policy on `assets` — the webhook uses the service role. |
| JWT org claim | Supabase `app_metadata` written at invite redemption via `auth.admin.updateUserById()`. Server-controlled, not user-writable. No Custom Access Token Hook, no `org_members` join table. |
| Column immutability | `REVOKE UPDATE` on evidence columns from `authenticated`/`anon`; `BEFORE UPDATE` trigger raising on any change. The **trigger** is the real control — it fires even for `service_role`, which bypasses RLS and column grants. |
| Audit hash chain | `append_audit_log()` `SECURITY DEFINER` + `SET search_path`, `pg_advisory_xact_lock` per asset, hashing the **stored** `hashed_at`, with `details_canonical` supplied by the API |
| Report manifest | `report_manifest_entries` (ordinal, role, public_id, derivative, sha256, verified_at) so finalized reports stay verifiable |
| Cloudinary signal harvest | `assets.phash`, `dominant_colors`, `cloudinary_quality_score`, `face_count`, `cloudinary_metadata_at` + GIN trigram index on `phash` |
| Quota + retention | `orgs.quota_bytes` (50 GB), `bytes_used`, `retention_years` (7) |
| Audit partitioning | Declare `audit_logs` `PARTITION BY RANGE (hashed_at)` before it reaches 1M rows |
| Config schema | JSON Schema for `projects.config` enforcing `observation_types[]` with `type`, `label`, `model`, `gps_radius`, `phase_field` |
| Model registry seed | `forestry/trained` placeholder row, water/infrastructure/agriculture as `unsupported` |
| Role model | `platform_admin` (all orgs) distinct from `org_admin` (own org) |
| Test helper | `TRUNCATE orgs CASCADE` + org/role fixture for tests |

**Gate**
- `supabase db reset` succeeds from scratch
- A test proves: user in org A cannot `SELECT` a row in org B (RLS)
- A test proves: `UPDATE assets SET sha256_hash = ...` raises
- A test proves: appending 3 audit rows yields a verifiable chain
- A test proves: **concurrent** `append_audit_log` calls for one asset serialize and produce one linear chain (advisory lock, not luck)
- A test proves: the chain verifies using the stored `hashed_at`, not `clock_timestamp()`
- A test proves: `anon` cannot `INSERT` into `assets` (no permissive insert policy)
- A test proves: an `org_admin` cannot `UPDATE` another org's row (policy needs `WITH CHECK`)
  - `projects.config` rejects an observation type missing `model` or `gps_radius`
  - **Schema completeness.** A test asserts every table and column named in this
  - `asset_derivatives` exists with `parent_asset_id`, `transformation`,
  - The Cloudinary signal columns exist on `assets`: `cloudinary_created_at`,
  - `orgs` defaults are `quota_bytes = 53687091200` (50 GB) and
- **Task completeness.** Every row of this phase's task table above is `DONE`, with the implementing file named. A passing gate does not imply a complete phase, because a gate only tests what it names. Any `PARTIAL`, `MISSING`, or `BLOCKED` row blocks `/commit`.

---

## Phase 2 — Shared Package

**Depends on:** Phase 0 · ⬛ parallel with Phase 1
**Goal:** One source of truth for types and validation, imported by every service.

| Task | Detail |
|------|--------|
| Domain types | `Org`, `Project`, `Asset`, `AssetDerivative`, `Observation`, `ChangeEvent`, `Report`, `AuditLog`, `ModelRegistryEntry` |
| Zod schemas | Mirrors of the DB shapes; `ProjectConfigSchema` with `observation_types[]` |
| JCS canonicalization | `canonicalize(value) → string` implementing RFC 8785, plus `sha256Canonical(value)` |
| JCS test vectors | RFC 8785 appendix fixtures, plus a cross-language fixture shared with the Python implementation |
| Signing payload builder | `buildSigningPayload(input)` producing the exact byte sequence the app signs |
| State enums | Asset lifecycle, job states, verification states, `signature_tier` |
| Envelope | `{ data, error }` response shape + typed `ApiError` codes |

**Gate**
  - `pnpm test` in `packages/shared` passes, including the RFC 8785 vectors
  - The canonicalizer is byte-identical to the Python implementation in Phase 6 (shared fixture test)
  - **Failure path — invalid schema rejected.** A Zod schema rejects a malformed payload: wrong type, missing required field, and an unknown key that must be stripped. Assert the parse *throws*; a schema that silently accepts bad input is a `FAIL`, not a `PASS`. `AGENTS.md` §6 requires the failure path to be tested, not just the happy path.
  - **Failure path — tampered signing payload rejected.** A payload mutated after signing fails verification, and a payload signed with the wrong key fails verification. Assert both return a verification error rather than a partial accept.
  - **Type escape audit.** No `any` and no non-null assertion in `packages/shared` outside the one documented third-party boundary. `AGENTS.md` §4 requires `strict` + `noUncheckedIndexedAccess`; an escape used to silence a real type error is a `FAIL`.
- **Task completeness.** Every row of this phase's task table above is `DONE`, with the implementing file named. A passing gate does not imply a complete phase, because a gate only tests what it names. Any `PARTIAL`, `MISSING`, or `BLOCKED` row blocks `/commit`.

---

## Phase 3 — API: Core

**Depends on:** Phases 1, 2
**Goal:** A secured API that can ingest and verify a real upload end to end.

| Task | Detail |
|------|--------|
| Fastify app | Plugin layout: auth, db, cloudinary, queue, routes |
| Supabase clients | Request-scoped client using the caller's JWT; separate service-role client for workers only |
| Auth plugin | Verify Supabase JWT; attach `user_id`, `org_id`; 401/403 handling |
| Project CRUD | List, create, get tree (`parent_project_id` recursive CTE), update config |
| Webhook ingest | `POST /webhooks/cloudinary` — verify notification signature, match stored `public_id`, re-hash bytes, JCS re-canonicalize EXIF, verify Ed25519, insert asset, enqueue `ai-enrich` |
| Verification module | `verifyAssetIntegrity(assetId) → { exif_hash, sha256, signature, sync_delay, clock_skew, chain }` each `pass`/`fail`/`unknown` |
| Quarantine path | Any `fail` → `verification = 'failed'`, `quarantined_at` set, excluded from reports |
| Idempotency | Same `sha256_hash` + project → upsert, no duplicate row, no duplicate job |
| Health | `GET /health` (liveness), `GET /health/ready` (DB + Redis + Cloudinary) |
| Delivery URLs | `POST /v1/assets/{id}/original-url` (authenticated + auth token) and `/derivative-url` (signed). `public_id` is **never** accepted from the client; resolve by `asset_id` under RLS. |
| Transformation allowlist | Client-supplied `transformation` matched against named transforms + `w_ h_ c_ f_auto q_auto dpr_auto`. Anything else → 422, so a signed URL is not a free resize or gen-AI billing primitive. |
| ML client | Mint the 120s internal JWT per call; never send a bare shared secret |
| Pagination | Every list endpoint: `limit` default 20, clamp at 100, opaque `next_cursor`. Search caps at 1000 matches and returns `truncated` + true `total_matched` |
| Rate limits | Per-user sliding window per `docs/architecture/api-contracts.md` §7; 429 with `Retry-After` |
| Org provisioning | `POST /v1/orgs`, `platform_admin` only. Single-use invite tokens, 72h expiry, stored hashed. No public signup route exists. |
| Quota enforcement | Nightly reconciliation recomputes `orgs.bytes_used`; 507 at 100%. Never delete media to stay under cap. |
| Error handling | Typed errors, `request_id` on every response, structured Pino logs |

**Gate**
- Integration test: webhook with a valid signature inserts an `assets` row in `ready` state
- Integration test: tampered EXIF → `quarantined`, no report selection
- Integration test: replaying the same webhook twice creates one row
- Integration test: org A's token cannot read org B's project
- Integration test: a client cannot obtain a URL for another org's asset by passing a known `sha256`
- Integration test: an arbitrary transformation string is rejected 422
- Integration test: no internal JWT → ML call rejected
- Test: `limit=500` is clamped to 100, not honoured
- Test: `POST /v1/orgs` as a non-`platform_admin` is 403; there is no public signup route
- **Task completeness.** Every row of this phase's task table above is `DONE`, with the implementing file named. A passing gate does not imply a complete phase, because a gate only tests what it names. Any `PARTIAL`, `MISSING`, or `BLOCKED` row blocks `/commit`.

---

## Phase 4 — Capture App

**Depends on:** Phases 0, 2 · ⬛ parallel with Phase 3
**Goal:** Capture a signed, hashed, geo-tagged photo fully offline and sync it.

| Task | Detail |
|------|--------|
| Project picker | Hierarchical list with observation-type selection and phase |
| Camera screen | `expo-camera`, capture still + 30s video, front/back toggle |
| GPS | `expo-location` `BestForNavigation`; store `lat`, `lon`, `accuracy_m`, `altitude_m`, `provider`; warn and optionally block above a threshold |
| EXIF freeze | Read → allowlist `Make`, `Model`, `LensModel`, `Orientation`, `ColorSpace`, `ImageWidth`, `ImageHeight`; discard all editable tags |
| Hashing | Streamed SHA-256 over file bytes (native module or chunked read — never whole-file in JS) |
| Signing | Ed25519 with a Keystore-wrapped key; `signature_tier` honestly set to `device` or `server` |
| MMKV queue | Encrypted local store; per-item state machine; survives app restart |
| Sync engine | `NetInfo` + `expo-background-fetch`; resumable; records `upload_started_at` before each attempt |
| Offline UX | Clear queued/syncing/confirmed/rejected states; rejection reasons shown |
| Video capture | 30s cap, auto thumbnail, client-side keyframe hinting |

**Gate**
- `exif_hash` computed on device equals the server's JCS hash (shared fixture)
- **Failure path — rejection is persisted, not dropped.** An item the server rejects is stored with its reason and is not silently retried forever. A test asserts a `rejected` item is never re-attempted, because an infinite retry is a silent failure with a network bill attached.
- **Failure path — partial upload is not marked done.** A sync attempt interrupted mid-upload leaves the item in a resumable state, never `confirmed`. `upload_started_at` is written *before* the attempt, so `sync_delay_seconds` stays honest (§3.7).
- `sha256` of a known fixture file matches `sha256sum`. A 200 MB file is hashed without loading it whole into JS memory — assert peak memory stays bounded, since "streamed" in the task table is a claim that must be tested.
- **Failure path — EXIF allowlist is enforced.** Only the allowlisted keys survive into the hash. An injected `Software` or `DateTimeOriginal` key does not change `exif_hash`, proving a stripped-EXIF file cannot be re-identified by the thing it was stripped of.
- **Failure path — signature over altered payload is rejected.** A payload mutated after signing fails verification, and `signature_tier` reads `server` — never `device` — when the Keystore path is unavailable. A test asserting `device` on the fallback is a `FAIL`, per the stop condition in §8.
- Video capture stops at 30s, emits a thumbnail, and keyframe hints honour the configured interval. A test asserts the 31st second is not recorded.
- The project picker returns sub-projects with their inherited `observation_type` and `phase`, proven by a fixture with a two-level hierarchy.
- **Task completeness.** Every row of this phase's task table above is `DONE`, with the implementing file named. A passing gate does not imply a complete phase, because a gate only tests what it names. Any `PARTIAL`, `MISSING`, or `BLOCKED` row blocks `/commit`.

**Deferred to user review** — these need a human with a device, a staging environment, or a clock. An agent reports each as `BLOCKED (needs user review)`, which blocks `/commit` until the user runs it and reports the result.

- Device test: airplane mode → capture 3 photos → reconnect → all 3 reach the API verified
- Device test: killing and relaunching the app preserves the queue
- Device test: editing the caption after signing invalidates verification server-side

---

## Phase 5 — Cloudinary Pipeline

**Depends on:** Phase 3 · ⬛ parallel with Phases 4 and 6
**Goal:** Every transformation is a tracked derivative; originals stay pristine.

| Task | Detail |
|------|--------|
| Preset setup | `verified_capture` unsigned preset: allowed formats, `max_file_size`, `incoming_webhook` with signature, overwrite disabled |
| Named transforms | `report_thumb`, `report_full`, `report_social`, `report_diff` with `f_auto` + `q_auto:eco` — exact strings in `docs/architecture/CLOUDINARY_TRANSFORMATIONS.md` §5 |
| Generative transforms | `b_gen_fill` (note: a `b_` qualifier, not `e_`), `e_gen_remove`, `e_gen_recolor`, `e_gen_restore`, `e_gen_background_replace` |
| Async handling | Generative transforms return **423 Locked** while generating, **420 Pending** for incoming transformations. Register as eager transformations at upload and read `secure_url` from the response. Never `fetch()` one synchronously in a request handler. |
| Derivative writer | `createDerivative(parentAssetId, transformation, kind, isGenerative)` → uploads, inserts `asset_derivatives`, appends audit log |
| Signed URL helper | All delivery URLs signed server-side; short TTL; never expose the API secret |
| AI tagging | `categorization: google_tagging` + `detection: openimages` at ingest; tags written to `observations` |
| Video transforms | Clip extraction (`so_`/`eo_`/`du_`), `sp_auto` streaming |
| Reconciliation job | Nightly: list Cloudinary assets, compare to `assets`, report orphans and missing rows |
| Retention | Lifecycle rule + documented policy; evidence assets excluded from auto-expiry |

**Gate**
- Test: every string in `docs/architecture/CLOUDINARY_TRANSFORMATIONS.md` §1 is accepted by the Cloudinary SDK without error
- Test: a request for a generative transform returns 423 and the client retries with backoff, or the asset was pre-generated eagerly
- Test: derivative rows link to their parent and the audit chain is intact
- Test: a gen-AI call is rejected when `parent` is not marked as a report derivative
  - Test: reconciliation finds a deliberately orphaned Cloudinary asset
  - **No hand-rolled signing (§3.11).** `git grep` finds no HMAC/`createHash`/`crypto.subtle` used to build a Cloudinary signature. URL construction goes through `@cloudinary/url-gen`; server signing goes through the Node SDK v2 helpers. Assert a signature is produced by the SDK, not by string concatenation plus a manual digest.
  - **No client-supplied `public_id` (§3.11).** A request carrying `public_id` in the body is rejected `422`. The client asks by `asset_id`; the API resolves it under RLS. A passing test must show a forged `public_id` cannot redirect delivery to another org's asset.
  - **No Cloudinary-as-database reads (§3.9).** `git grep` finds no call to the Search API, `resources_by_*`, or `api.list()` in a product read path. The only permitted Admin API uses are the nightly reconciliation job and signing delivery URLs for assets already selected via Postgres.
  - **URL signing grants no expiry (§3.11).** Assert the delivery URL's `v{...}` segment is treated as a cache-buster only; real expiry is asserted against the `auth_token` on `type: authenticated` originals. A test that assumes `v{...}` expires is a `FAIL`.
- **Task completeness.** Every row of this phase's task table above is `DONE`, with the implementing file named. A passing gate does not imply a complete phase, because a gate only tests what it names. Any `PARTIAL`, `MISSING`, or `BLOCKED` row blocks `/commit`.

---

## Phase 6 — ML Service

**Depends on:** Phase 2 · ⬛ parallel with Phases 4 and 5
**Goal:** Quantified, versioned change detection with honest degradation.

| Task | Detail |
|------|--------|
| FastAPI app | `/health`, `/model-info`, `/detect-change`, `/detect-change-video`, `/classify-activity`, `/extract-signals` |
| Registry loader | Resolve `model` key → `model_registry` row → cached weights; cache by `(key, version)` |
| Status gate | `status != 'trained'` → `{"status":"unsupported"}`. **No fallback to another sector.** |
| Forestry pipeline | YOLOv8n single-class sapling detector + ChangeFormer change mask |
| Base detector | COCO YOLOv8n for person/machinery, **instantiated once on the model object, not per request** |
| Quantification | Sapling count delta, area change in m²/ha from GPS ground sampling distance, % change, confidence |
| Diff generation | Render the ChangeFormer mask as a red-overlay PNG locally, upload to Cloudinary, return `diff_asset_id`. **Cloudinary has no diff effect and no difference blend mode** — do not attempt one. |
| Video pipeline | **In scope.** FFmpeg keyframe extraction → ORB match + homography → per-pair change → aggregate metrics. Add `ffmpeg` to the image and pin the major version. |
| Python JCS | Port of `canonicalize`; shared fixture test against `packages/shared` |
| Internal JWT auth | API mints a 120s HS256 JWT (`sub`, `org_id`, `job_id`); ML verifies on every request. Reject a missing or expired token with 401. |
| SSRF guard | Accept only Cloudinary URLs carrying a genuine `exp`; reject private IP ranges |
| Tests | Unit on the quantifier with synthetic fixtures; `status=unsupported` path covered |

**Gate**
- `pytest` passes with the quantifier unit tests
- Test: requesting `water` model returns `unsupported`, never forestry output
- Test: identical input yields identical metrics (determinism check)
- Test: a request with no internal JWT is rejected 401
- Test: 10 concurrent `/detect-change` calls load the weights **once** (assert a single model instantiation)
- Test: a 30s video fixture produces per-keyframe metrics and an aggregate
  - Cross-language JCS fixture matches the TypeScript implementation
  - **Metrics come from a model, never from an LLM (§3.2).** Every number in a `change_events` row and in a generated report resolves to a `model_registry` version. `git grep` finds no LLM call in the path that produces a metric, and no prompt whose output is parsed as a number.
  - **Every metric records `model_version` (§3.2).** A test inserts a change event with `model_version = NULL` and asserts it is rejected at the database level, not merely omitted by the writer. `AGENTS.md` §3.2 makes this mandatory on every row.
  - **An LLM may summarise but never adjust (§3.2).** Report prose is generated only from already-computed metrics. A test asserts the report's metric values equal the stored `change_events` values byte-for-byte, so a reworded or "rounded" number fails the gate.
- `ruff`, `mypy --strict`, `pytest` all clean
- **Task completeness.** Every row of this phase's task table above is `DONE`, with the implementing file named. A passing gate does not imply a complete phase, because a gate only tests what it names. Any `PARTIAL`, `MISSING`, or `BLOCKED` row blocks `/commit`.

---

## Phase 7 — Pairing & Change Events

**Depends on:** Phases 1, 3, 6
**Goal:** Turn a pile of verified assets into defensible before/after pairs.

| Task | Detail |
|------|--------|
| Pairing job | Filter `(project_id, observation_type)` → grid-bucket by `gps_radius` → cluster → sort by `device_capture_timestamp` → split by phase → pair |
| `pair-assets` worker | Bounded by `gps_radius` from config, never a global constant |
| `detect-change` worker | Calls ML service, persists `change_events` with `model_version` and `diff_asset_id` |
| Failure capture | `status = 'failed'` rows with a reason; never a silent drop |
| Metrics schema | `change_metrics` validated against the sector's schema |
| Manual override | API endpoint to link or split a pair, with an audit entry |

**Gate**
- Test: two sectors in one project never pair with each other
- Test: assets beyond `gps_radius` are not clustered
- Test: an ML failure produces a `failed` change_event, not a missing row
- **Failure path — an off-schema metric is rejected.** A metric that is not in the sector's registered schema is refused at write time, and the rejection names the offending key. Silently storing it is how an untraceable number reaches a report (§3.2).
- **Pairing is idempotent.** Re-running the job over an unchanged window creates no duplicate pairs. A retry that doubles every pair is a data-integrity bug that reads as a successful run.
- **Failure path — a relink or split outside the caller's org is rejected.** The manual-override endpoint resolves pair IDs under RLS, so a crafted ID from another org returns `404`, not a silent success. A manual endpoint that skips the ownership check is a privilege-escalation path.
- **Task completeness.** Every row of this phase's task table above is `DONE`, with the implementing file named. A passing gate does not imply a complete phase, because a gate only tests what it names. Any `PARTIAL`, `MISSING`, or `BLOCKED` row blocks `/commit`.

**Deferred to user review** — these need a human with a device, a staging environment, or a clock. An agent reports each as `BLOCKED (needs user review)`, which blocks `/commit` until the user runs it and reports the result.

- Test: manual relink appends to the audit chain

---

## Phase 8 — Dashboard Core

**Depends on:** Phases 1, 3 · ⬛ parallel with Phases 6 and 7
**Goal:** Search, browse, and inspect evidence.

| Task | Detail |
|------|--------|
| App shell | Routing, auth gate, org/project context, layout |
| Supabase client | Anon key + RLS; Realtime subscription helper |
| TanStack Query layer | Query keys, invalidation on Realtime events |
| Project tree | Hierarchical picker with observation-type badges |
| Search + facets | `q`, bbox, date range, tags, `gps_accuracy_max`, asset type, phase; viewport-driven map queries |
| Map | MapLibre GL, asset markers, clustering, accuracy circles |
| Asset detail | Media viewer, EXIF panel, GPS, timestamps, integrity panel, derivative lineage tree |
| Change review | Side-by-side + diff overlay, metrics table, confidence, model version |

**Gate**
- E2E (Playwright): login → pick project → search by tag → open asset → see integrity `pass`
- E2E: a quarantined asset is visible in an admin queue and absent from report selection
- **Every facet is tested individually.** `q`, `bbox`, date range, `tags`, `gps_accuracy_max`, asset type, and `phase` each get their own case. A single happy-path search proves nothing when seven filters can be silently ignored.
- **Failure path — no leaking rows across orgs.** With an org A session, no query, facet, or Realtime event returns an org B asset. This is asserted at the API boundary, because RLS is the real control and the UI is not.
- **Failure path — every async view has all three states.** Loading, empty, and error each render explicitly for search results, asset detail, and the admin queue. A component that renders nothing on error is a `FAIL` — silent blank screens are how a broken filter ships.
- Asset detail renders the derivative lineage tree: a parent with derivatives shows the `transformation` string per row, so a user can see which bytes are original and which are derived (§3.1).
- Change review displays the `model_version` beside every metric. A metric shown without its version is a `FAIL`, because it cannot be traced to a registry row (§3.2).
- **Failure path — Realtime invalidation is mapped, not guessed.** A unit test proves a `ready` asset event invalidates exactly the right query keys. An unmapped event silently serves stale data that looks correct.
- **Task completeness.** Every row of this phase's task table above is `DONE`, with the implementing file named. A passing gate does not imply a complete phase, because a gate only tests what it names. Any `PARTIAL`, `MISSING`, or `BLOCKED` row blocks `/commit`.

**Deferred to user review** — these need a human with a device, a staging environment, or a clock. An agent reports each as `BLOCKED (needs user review)`, which blocks `/commit` until the user runs it and reports the result.

- Realtime: a new `ready` asset appears without a manual refresh

---

## Phase 9 — Reports

**Depends on:** Phases 5, 7, 8
**Goal:** A donor-ready document with a machine-checkable integrity appendix.

| Task | Detail |
|------|--------|
| Template | Handlebars: cover, project summary, metrics tables, before/after pairs, map, video clips |
| Integrity appendix | Hash chain excerpt, per-asset signature status, timestamp comparison, model versions |
| Gate on verification | Generation refuses if any selected asset is not `verified` |
| Renderer | Puppeteer → PDF; upload to Cloudinary; store the template + input IDs for regeneration. Embed the Inter font files or accept that line-wrapping differs per machine and determinism fails. |
| **Self-contained artifact** | Inline all media into the artifact at generation (data URIs for HTML, embedded binaries for PDF) using a `report_full` derivative capped at 1920px. A finalized report must render offline with no network and no valid token. |
| Manifest | Write one `report_manifest_entries` row per inlined element: ordinal, role, `public_id`, derivative, `sha256_hash`, `verified_at`. Ship it as the integrity appendix. |
| Video embeds | Keyframe poster images inlined; clip *transformation strings* recorded in the manifest. Do not depend on a live clip URL in an archived report. |
| Gen-AI derivatives | Recolor / expand / privacy edits applied **only** to report copies, each logged with `is_generative = true`. Caption/translation are add-on API calls, not URL transforms. |
| Async gen-AI job | Gen-AI returns 420/423, so social variants are a separate BullMQ job that polls. `POST /v1/reports/generate` returns the report plus a `manifest` and does **not** block on gen-AI. |
| Determinism | Same inputs + same template version → byte-identical document. Serialize every metric with **Decimal.js**, never float `JSON.stringify`, so `0.1 + 0.2` drift cannot change a byte. Record `template_version`. |

**Gate**
- Test: report with one quarantined asset is rejected with a clear error
- Test: every derivative created during generation has `is_generative = true` and a parent link
- Test: the PDF's appendix lists the same `current_hash` as the DB
- Test: the finalized report renders with the network disabled and every image present
- Test: regenerating from identical inputs produces a byte-identical file
- Test: each manifest row's `sha256_hash` matches the bytes actually embedded in the artifact
- Test: a gen-AI derivative is never created on an original `public_id`
- **Task completeness.** Every row of this phase's task table above is `DONE`, with the implementing file named. A passing gate does not imply a complete phase, because a gate only tests what it names. Any `PARTIAL`, `MISSING`, or `BLOCKED` row blocks `/commit`.

---

## Phase 10 — Audit & Integrity Surfacing

**Depends on:** Phases 3, 8, 9
**Goal:** A reviewer can independently verify a report in under 5 minutes.

| Task | Detail |
|------|--------|
| Integrity endpoint | Full per-asset result with `pass`/`fail`/`unknown` per check |
| Chain verifier | `verifyChain(from, to)` walking `audit_logs` |
| Integrity viewer UI | Chain visualization, signature status, timestamp comparison, exportable verification record |
| Report verification | Public-safe verification receipt for a report ID |

**Gate**
- `unknown` clock skew is displayed as unknown, not as a pass
- **Failure path — a tampered row breaks verification.** Muting one `audit_logs.details` or `row_hash` value makes `verifyChain` return a failure naming that row. A verifier that only checks the chain *links* and not the *content* would pass this wrongly, so the test must tamper a value, not remove a row.
- **Failure path — a missing row is detected, not skipped.** Deleting an intermediate audit row makes verification fail with a gap. A verifier that tolerates gaps is worse than none, because it launders a deleted audit record.
- **Failure path — `unknown` never renders as `pass`.** When the signed NTP offset is unavailable, the skew check is `unknown`, the report is not blocked, and the UI shows `unknown`. Assert the absence of the word `pass` in the rendered output, not merely the presence of `unknown`.
- The verification receipt is public-safe: given a report ID it returns only hashes and timestamps, and it leaks no `org_id`, user identity, GPS coordinate, or caption. Assert each of those is absent from the response body.
- An exported verification file re-verifies against Postgres on a second run and produces the same result, so the export is evidence and not decoration.
- **Task completeness.** Every row of this phase's task table above is `DONE`, with the implementing file named. A passing gate does not imply a complete phase, because a gate only tests what it names. Any `PARTIAL`, `MISSING`, or `BLOCKED` row blocks `/commit`.

**Deferred to user review** — these need a human with a device, a staging environment, or a clock. An agent reports each as `BLOCKED (needs user review)`, which blocks `/commit` until the user runs it and reports the result.

- The 5-minute manual audit passes end to end on a generated report

---

## Phase 11 — Hardening & Release

**Depends on:** all prior phases
**Goal:** Production-ready.

| Task | Detail |
|------|--------|
| Rate limiting | Per-org upload and API limits; unsigned-preset abuse mitigation |
| Test suite to target | API 80%, ML 70%, integration on critical paths, E2E on the 9 exit criteria |
| CI/CD | Per-service deploy workflows, preview envs, migration gate |
| Monitoring | Pino + structlog, OpenTelemetry traces, Sentry, queue-depth and cost alerts |
| Secrets | Populate platform env vars; rotate schedule documented; verify no secret in any bundle |
| Docs | Update `README.md`, `docs/architecture/api-contracts.md`, schema doc to match reality |
| MVP exit criteria | Walk `PRD.md` §12 line by line and check every box |

**Gate**
  - `git grep` finds no secret in any client bundle or tracked file
- **The migration gate actually fails.** A CI check asserts every table and column named in `DATABASE_SCHEMA.md` exists in `information_schema` after `supabase db reset`. Add a test that the check *catches* a deliberately unreferenced missing table — a gate that has never been seen to fail is not a gate. This is the §7.1 loophole, closed in CI rather than in prose.
- **Failure path — rate limits are enforced per org.** A test drives the per-org upload limit and asserts `429` with a `Retry-After`, then asserts a *second* org is unaffected. A limit applied globally is a denial-of-service on the other tenants.
- **Failure path — logs carry no secret or PII.** Structured log output for an upload request is asserted to contain no `CLOUDINARY_API_SECRET`, no service-role token, and no GPS coordinate. Verbose production errors are a frequent secret leak; the check is on emitted output, not on the log call site.
- Coverage thresholds are enforced in CI, not merely reported: API 80%, ML 70%, with integration tests on the critical paths and E2E on the 9 exit criteria. A threshold that only prints a number and never fails the build is not a gate.
- Each of the 4 services builds and deploys from a clean checkout of `main` with no shared build step, so one service cannot mask another's failure.
- Docs are asserted to match reality: `docs/architecture/api-contracts.md` and `DATABASE_SCHEMA.md` name only tables and endpoints that exist, checked by a script rather than by reading.
- **Task completeness.** Every row of this phase's task table above is `DONE`, with the implementing file named. A passing gate does not imply a complete phase, because a gate only tests what it names. Any `PARTIAL`, `MISSING`, or `BLOCKED` row blocks `/commit`.

**Deferred to user review** — these need a human with a device, a staging environment, or a clock. An agent reports each as `BLOCKED (needs user review)`, which blocks `/commit` until the user runs it and reports the result.

  - All **9** criteria in `docs/architecture/MVP_EXIT_CRITERIA.md` are individually `PASS` — eight is a failure, not a near-miss. Cite the row number for each. That file is the gate-facing list; it supersedes the prose list in `README.md`.
- Full CI green; staging deploys succeed for all 4 services

---

## Parallelization for 3 People

| Wave | Person A — Frontend | Person B — Backend | Person C — ML / Fullstack |
|------|--------------------|--------------------|--------------------------|
| 1 | Phase 0 scaffold + `ui-components` | Phase 0 + Phase 1 database | Phase 0 + Phase 2 shared + JCS |
| 2 | Phase 4 capture app | Phase 3 API core | Phase 5 Cloudinary pipeline |
| 3 | Phase 4 sync hardening | Phase 3 verification + Phase 7 pairing | Phase 6 ML service |
| 4 | Phase 8 dashboard | Phase 9 report templates | Phase 6 video pipeline |
| 5 | Phase 8 change review | Phase 9 renderer + gen-AI derivatives | Phase 7 metrics schema |
| 6 | Phase 10 integrity viewer | Phase 11 hardening | Phase 11 model registry + drift |

**Merge order per wave:** database migrations first (they gate everyone), then shared, then services.

---

## Critical Path

```
Phase 0 → Phase 1 (schema) → Phase 3 (webhook ingest) → Phase 7 (pairing) → Phase 9 (report)
                                                                    ↘ Phase 6 (ML) ↗
```

Phase 4 (capture app) and Phase 8 (dashboard) are the longest by line count but are not on the critical path to a demoable end-to-end flow.

---

## Stop Conditions

Pause and ask rather than improvising if:

- A Cloudinary transformation named in the docs does not exist or behaves differently than documented.
- Native device signing (Secure Enclave / Keystore) cannot be done — the `server` fallback must be agreed explicitly, never silently substituted.
- A sector has no trained model. Ship `unsupported`; do not invent metrics.
- A schema change would require mutating an existing evidence column.
- Rate limits or costs for generative AI cannot be bounded before a demo.

---

*End of Build Order*
