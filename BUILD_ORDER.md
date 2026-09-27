# Build Order

**Purpose:** Execution plan for an AI coding agent (or a team) to implement the platform from an empty repository.
**Read first:** `PRD.md` (what), `ARCHITECTURE.md` (how), `AGENTS.md` (rules).

Each phase has a **gate** — a concrete, checkable condition. Do not start the next phase until the current gate passes. Phases marked ⬛ can run in parallel with the one after them.

---

## Current State

**Update this table at the end of every session.** It is the first thing to read
and the first thing to update — it exists so a fresh session never re-derives
where the work stopped.

| Phase | Status | Gate | Notes |
|---|---|---|---|
| 0 — Monorepo Scaffold | ✅ done | ✅ passed (local) | pnpm+turbo workspace, 6 packages, TS strict, ESLint flat+Prettier, ruff/mypy/black, dashboard (React19+Vite) renders `CldImage`, CI skeleton. Not yet committed. |
| 1 — Database & Auth | ⬜ not started | — | |
| 2 — Device Signing | ⬜ not started | — | Ed25519 may be infeasible on Expo — see stop condition |
| 3 — Capture & Verification | ⬜ not started | — | Known defect in prior impl: webhook signature check failed open |
| 4 — CV Detection | ⬜ not started | — | Blocked on model weights |
| 5 — Before/After Pairing | ⬜ not started | — | |
| 6 — Video & Models | ⬜ not started | — | Blocked on weights + FFmpeg |
| 7 — Reports | ⬜ not started | — | |
| 8 — Generative & Media | ⬜ not started | — | Confirm Cloudinary Free plan allows generative transforms |
| 9 — Deploy & Harden | ⬜ not started | — | |

**Last updated:** 2026-09-27 · Phase 0 monorepo scaffold implemented; gate green locally (`pnpm lint && pnpm typecheck && pnpm test` and `turbo build` pass across all 6 packages; dashboard dev server boots and renders `CldImage`; no `CLOUDINARY_API_SECRET` reference in `apps/dashboard`). Working tree only — 0 commits, not yet committed (owned by `/commit`).
**Blocked on user input:** generative transform budget cap
**Not yet done:** `001_core_schema.sql` has never been applied to any Supabase project · CI (`.github/workflows/ci.yml`) not yet executed on a real push (verified locally-equivalent)

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

---

## Phase 1 — Database

**Depends on:** Phase 0
**Goal:** Every table, constraint, and policy exists and is enforced. This is the foundation of the integrity story, so it comes before any service code.

| Task | Detail |
|------|--------|
| Migrations | `supabase/migrations/` — orgs, projects, assets, asset_derivatives, observations, change_events, reports, audit_logs, model_registry, sync_state |
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
- Device test: airplane mode → capture 3 photos → reconnect → all 3 reach the API verified
- Device test: killing and relaunching the app preserves the queue
- Device test: editing the caption after signing invalidates verification server-side
- `exif_hash` computed on device equals the server's JCS hash (shared fixture)

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
- `ruff`, `mypy --strict`, `pytest` all clean

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
- The 5-minute manual audit passes end to end on a generated report
- `unknown` clock skew is displayed as unknown, not as a pass

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
- All 9 MVP exit criteria pass on staging
- `git grep` finds no secret in any client bundle or tracked file
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
