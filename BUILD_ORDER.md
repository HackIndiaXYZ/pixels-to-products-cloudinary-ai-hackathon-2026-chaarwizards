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
| 5 | Cloudinary Pipeline | 🟨 implemented | 🟨 green (local) on `phase/5` — **93/93** api + 62/62 capture-app vitest; **live e2e proven against cloud `o2ystfbm`: `verified_capture` preset created + verified via real Admin API; 13 migrations pushed to the live Supabase project (clears known blocker #1); `pnpm reconcile` runs end-to-end (60 resources, 60 orphans, 0 missing); live generative `e_gen_*` async path exercised — surfaced + fixed a real bug (Cloudinary returns `status:'processing'`, not `'pending'`, which the adapter was mis-classifying as ready)**; live Redis + device-side capture→real-API run BLOCKED (needs Redis / a phone + a Supabase login) | `apps/api` Phase-5 media pipeline behind the same injectable ports. Ships: exact §5 named transforms + generative transform strings and a video clip (`so_`/`eo_`/`du_`) + `sp_auto` helper (`lib/transformations.ts`); `verified_capture` unsigned-preset definition (overwrite/invalidate off, `type:authenticated`, allowed formats + `max_file_size`, `google_tagging`+`openimages`, signed incoming webhook) + 7-year retention policy excluding evidence from Cloudinary auto-expiry (`lib/cloudinary-preset.ts`); derivative writer `createDerivative()` — eager transform, append-only `asset_derivatives` insert (parent link + exact string §3.1), audit append, generative-on-report-copy-only guard, generative reported `pending` never fetched sync (§3.11) (`services/derivatives.ts`); SDK-only signing + `signRequest` proving no hand-rolled HMAC, and an in-repo guardrail test that no product path calls the Admin resource/search API (§3.9/§3.11) (`plugins/cloudinary.ts`, `plugins/cloudinary-admin.ts`, `lib/cloudinary-guardrails.test.ts`); AI tags copied into `observations` at ingest, discarded on quarantine, never queried back (webhook); nightly reconciliation job reporting orphans/missing + recomputing `orgs.bytes_used` — **resolves the Phase 3 quota carry-over** (`services/reconciliation.ts`, `jobs/reconcile.ts`); preset setup entrypoint (`jobs/setup-preset.ts`). Capture-app carry-over done: `GET /v1/projects` now sent with a `Bearer` Supabase JWT via a session-store reader, DEV seed gated behind explicit `EXPO_PUBLIC_DEV_SEED=1` (no silent fallback), org/auth JWT-derived not env/body §3.4 (`apps/capture-app/src/api.ts`, `src/native/session.ts`, `App.tsx`). Lint/typecheck(lib+app)/build clean; secrets grep unchanged from baseline (names only). **BLOCKED (needs user review):** live Cloudinary account — **now largely unblocked**: the user provisioned cloud `o2ystfbm`, `apps/api/.env.local` was created from `ENVIRONMENT.md`/`env-secrets.local.txt` (gitignored, secrets not tracked), `pnpm --filter @impact/api setup:preset` created the `verified_capture` preset live and a read-back confirmed `unsigned:true, type:authenticated, overwrite:false, categorization:google_tagging, detection:openimages, allowed_formats, notification_url`. The user then supplied a Supabase access token + DB password; the 13 migrations were pushed to the live project (`supabase link` + `db push --yes`; `migration list` shows Local==Remote for all 13 — this also clears the project-wide known blocker #1), and `pnpm reconcile` now runs **end-to-end live**: `checked_resources:60, known_public_ids:0, orphans:60, missing:0` (the 60 stock Cloudinary demo assets are correctly flagged as orphans vs the empty evidence DB — satisfies the Phase 5 gate's orphan-detection item). Still BLOCKED: **real 420/423 generative** on the §8 generative-budget decision — **now unblocked & proven**: with the user's go-ahead a single bounded generative call per op was made against the live account; `e_gen_*` IS enabled on cloud `o2ystfbm`, and the async path returned immediately. This **caught a real bug**: Cloudinary reports async generative eager work as `status:'processing'` (URL already present, bytes not yet generated), which the adapter (`plugins/cloudinary.ts`) was classifying as `ready` — it would have served a still-generating URL (§3.11/§3.6 violation). Fixed by extracting `isEagerPending()` (ready only on `'complete'` or a status-less synchronous eager with a URL; `'processing'`/`'pending'`/`'failed'`/missing → pending) with 6 regression unit tests; a live re-run through the compiled adapter now returns `status:'pending', secureUrl:null`. Still BLOCKED: live Redis e2e (Redis not installed) and an on-device capture→real-API run (needs a phone + a Supabase login to mint the JWT). **Blocked on user input:** generative budget cap + Cloudinary Free-plan generative availability (§8). Working tree only — not committed (owned by `/commit`). |
| 6 | ML Service | 🟨 implemented | 🟨 green (local) on `phase/6` — **59 passed · 1 skipped (60 collected)** pytest (skip: live-DB `model_version=NULL` rejection needs `ML_TEST_DATABASE_URL`), ruff + mypy --strict clean; the 30s-video gate item runs against a real ffmpeg-generated fixture | `apps/ml-service` FastAPI service behind an injectable `Services` container (registry / downloader / uploader / keyframe extractor). Ships: 6 endpoints (`/health`, `/model-info`, `/v1/detect-change`, `/v1/detect-change-video`, `/v1/classify-activity`, `/v1/extract-signals`) with Pydantic validation (`schemas.py`, `app.py`); internal HS256 JWT verify — `sub`/`org_id`/`job_id`, `exp` required, 401 on missing/expired/wrong-key (`auth.py`); registry loader resolving key→`model_registry` row→cached model, **cache by `(key,version)` behind a lock, instantiated once** (proved by a 10-concurrent-`/detect-change` test) + the **status gate → `{"status":"unsupported"}`, no cross-sector fallback** (`registry.py`, `supabase_registry.py`); forestry pipeline (`models/forestry.py` YOLOv8n saplings + ChangeFormer + COCO base detector, torch/ultralytics **lazy-imported**) with a deterministic classical-CV baseline (`models/synthetic.py`) that runs the `weights_uri IS NULL` trained-placeholder honestly; quantifier — sapling delta, area m²/ha from GPS ground-sampling-distance, %-change, confidence, all pure/deterministic (`quantify.py`); red-overlay diff PNG rendered locally + SDK-signed upload, **no `e_diff`/hand-rolled signing** (`diff.py`, `cloudinary_io.py`); video pipeline **in scope** — ffmpeg keyframe extraction → ORB+homography alignment → per-keyframe + aggregate metrics (`video.py`); Python RFC 8785 JCS port **byte-identical to `packages/shared`** across all 8 shared fixtures — **resolves the Phase 2 cross-language carry-over** (`canonicalize.py`); SSRF guard (Cloudinary-host + genuine unexpired `exp` + private-range reject, `ssrf.py`); `Dockerfile` pinning ffmpeg (7.x). §3.2 guards: `git grep` finds no LLM in the metric path (test), endpoint metrics equal the quantifier output byte-for-byte, and `change_events.model_version NOT NULL` asserted from the migration DDL. **BLOCKED (needs user review):** live-DB rejection of `model_version=NULL` (needs a DB DSN); real fine-tuned forestry weights (`weights_uri` is NULL — the placeholder baseline runs meanwhile, §3.3-honest). Working tree only — not committed (owned by `/commit`). |
| 6.5 | Forestry Model Fine-Tuning | ⬜ not started | — | **User-run** (needs a GPU + public datasets); **optional for the demo** — the Phase 6 `weights_uri IS NULL` placeholder baseline is honest until real weights land. Agent scaffolds `apps/ml-service/training/` (download → prepare → train → evaluate → export → `promote_model.py`); user runs the GPU training, uploads `sapling_yolov8n.pt` + `changeformer.pt` to the private bucket, and flips the `model_registry` forestry row (**bump version** `v1-placeholder`→`v1.0`, record eval metrics). Nothing downstream is blocked on it. |
| 7 | Pairing & Change Events | 🟨 implemented | 🟨 green (local) on `phase/7` — vitest **124/124** api, migration applied + **78/78** pgTAP (new `06_manual_pairing_audit.sql` proves the manual relink/split path extends the hash chain and tampering breaks it), `supabase db reset` clean; live-DB human sign-off of the manual relink still noted for user review | `apps/api` Phase-7 pairing behind the same injectable ports. Ships: pure before/after pairing (`services/pairing.ts` — filter by observation_type FIRST per ADL-08, grid-bucket by the type's own `gps_radius`, connected-component cluster within radius, temporal sort, phase split, consecutive before→after pairing); `pair-assets` worker logic (`services/pair-assets.ts` — loads verified+located assets via the new `assets_for_pairing` SQL fn, enqueues one idempotent detect-change job per candidate, radius always from config never a constant); `detect-change` worker logic (`services/change-detection.ts` — resolves signed originals, calls the ML client, persists exactly one `change_events` row; every path persists a row §3.6 — ML throw/`unsupported`(§3.3, no cross-sector fallback)/off-schema metric all → `status='failed'` with a reason, success → `status='detected'` with the model's `model_version` and diff); metric-schema gate (`lib/change-metrics-schema.ts` — off-schema key refused at write time and named, §3.2, from `projects.config.metrics_schema` or a sector default); manual override endpoints (`routes/pairs.ts` — `POST /v1/pairs` link, `POST /v1/pairs/:id/split`, both resolve ids under RLS → 404 cross-org, both append to the audit chain, member+ only); BullMQ worker entrypoint (`jobs/workers.ts`); shared `ChangeEventSchema`/`CHANGE_EVENT_STATUSES` extended with `status`+`failure_reason`. **Schema change (§8, documented):** migration `20260927140000_change_events_pairing.sql` adds `change_events.status`+`failure_reason` (with a CHECK tying a reason to `failed`), a partial unique index `uq_change_events_pair` for idempotency, and the `assets_for_pairing` fn; DATABASE_SCHEMA.md + api-contracts.md updated to match. `model_version` stays NOT NULL — failed/manual rows carry a non-model sentinel (`none`/`manual`) with empty metrics, so §3.2 is not weakened. Gate: pairing idempotent (findPair skip + BullMQ jobId + DB unique idx), two sectors never pair, beyond-radius not clustered, ML failure → failed row not missing, off-schema metric rejected naming the key, cross-org relink/split → 404. lint/typecheck/build clean for shared+api. Working tree only — not committed (owned by `/commit`). **Manual-relink audit chain now covered by pgTAP** (`supabase/tests/06_manual_pairing_audit.sql`, 6 assertions, part of **78/78**): a `pair` then `split` append via `append_audit_log` and `verify_audit_chain` stays true across both, tampering with the manual-pair row breaks verification (§3.8). The live-DB human sign-off remains **BLOCKED (needs user review)** — the deferred item calls for a human-run inspection against real infrastructure, which an agent cannot self-certify (§7.1). |
| 8 | Dashboard Core | 🟨 implemented | 🟨 green (local) on `phase/8` — **52/52** dashboard + **143/143** api vitest, whole-workspace lint/typecheck/test green; **both browser Playwright E2E flows PASS** against the live local stack (`2 passed`, EXIT 0) after the JWKS/ES256 + CORS fixes | React 19 + Vite dashboard behind feature folders (`FRONTEND_ARCHITECTURE.md`). Ships: app shell + auth gate + org/project context reading `org_id`/`role` from JWT `app_metadata` only (§3.4/§3.10); Supabase anon-key client + Realtime bridge; TanStack Query layer with a central query-key factory and a **pure, unit-tested Realtime→invalidation mapping** (`shared/realtime/invalidation.ts`); typed API client that never sends `org_id` (§3.4) and throws on a failure envelope (§3.6); project tree with observation-type badges; search with all 7 facets (`buildSearchQuery`, each facet tested individually); MapLibre asset map (clustering + accuracy circles + viewport-driven bbox); asset detail (media viewer, EXIF/GPS/timestamp panels, integrity panel showing pass/fail/**unknown never as pass** §3.7, derivative lineage tree showing each `transformation` §3.1); change review (side-by-side + diff overlay + metrics table with `model_version` beside every metric §3.2); admin quarantine queue (flagged visible, excluded from report selection §3.1); all async views have loading/empty/error. **Missing API endpoints the dashboard consumes were implemented on `phase/8`** (Phase 3/5 scope pulled forward, per user decision): `GET /v1/search` (7 facets, RLS-scoped `search_assets` SECURITY-INVOKER SQL fn, full-set `total_matched`/`facet_counts`, 1000-cap, opaque cursor — `routes/search.ts`, 11 tests), `GET /v1/projects/:id/change-events` + `GET /v1/assets/:id/derivatives` (`routes/reads.ts`, 4 tests), and the integrity endpoint **reshaped to its documented flat contract** (`routes/integrity.ts` + `asset_integrity` SQL fn + `resolveIntegrityContract` running Ed25519 + RFC 8785 checks in Node, §3.7-honest). **API auth upgraded to verify Supabase ES256/RS256 JWTs via JWKS (HS256 fallback)** (`plugins/auth.ts`, `auth.jwks.test.ts`) and **CORS added** (`@fastify/cors` locked to `DASHBOARD_URL`) — the two gaps that had blocked the browser round-trip. New migrations `20260929010000_access_token_hook.sql` (hoists `app_metadata.org_id`→top-level for RLS), `20260929020000_search_assets.sql`, `20260929030000_asset_integrity.sql` — `supabase db reset` applies all 17 clean. **Live E2E proven:** with the local stack up (Supabase + seeded signed asset + user), `playwright test` runs both flows green — login → pick project → search by tag → open asset → **integrity `pass`**, and the quarantine admin queue. Reproduce locally with `enable_signup=true` for the local stack only (see finding #3 below; committed config keeps it `false` for §3.10). **Fixed the pre-existing dashboard typecheck FAIL** + a browser-bundle break (pure `@impact/shared/rn`). Working tree only — not committed (owned by `/commit`). |
| 9 | Reports | 🟨 implemented | ✅ green (local) on `phase/9` — api vitest **168/168** (+25 Phase 9), whole-workspace typecheck 8/8 · lint 8/8 · test 8/8; **live Puppeteer→PDF render PASSES** (Chromium 154; `renderer.live.test.ts` renders self-contained HTML offline to a valid `%PDF-` + proves byte-identical PDFs); **`supabase db reset` PASSES** — all 18 migrations apply from scratch and **pgTAP 78/78** stays green (Phase 9 migration breaks no prior phase); `information_schema` confirms the 4 new `evidence_packages` columns | `apps/api` Phase-9 report generation behind the same injectable ports. Ships: `POST /v1/reports/generate` + `GET /v1/report-templates` (`routes/reports.ts`); orchestration (`services/report-generation.ts`) — verification gate (refuses if any selected asset is not `verified`, §3.1), `report_full` derivative per photo inlined as base64 data URIs (self-contained/offline), one `report_manifest_entries` row per inlined element with the SHA-256 of the **embedded** bytes, integrity appendix (per-asset signature/EXIF/caption status with `unknown`-never-`pass` §3.7, timestamp comparison, model versions, hash-chain excerpt printing the DB tip `current_hash`), schematic SVG site map, video keyframe posters + recorded clip transformation strings; deterministic HTML assembly (`reports/assemble.ts`) with Decimal.js metric serialization (`lib/report-metrics.ts`) — regeneration is byte-identical because report_full creation is idempotent (no second derivative/audit row); Handlebars templates pinned by version (`reports/templates.ts`, `forestry_donor@1`); Puppeteer renderer with Inter-font embedding + PDF timestamp normalization (`reports/renderer.ts`); async gen-AI social-variant BullMQ job applied **only** to report copies, `is_generative=true`, never an original public_id (`services/report-genai.ts`, `report-genai` queue + worker), returned-and-non-blocking (§3.11). New migration `20260930010000_report_generation.sql` adds `evidence_packages.template_id/template_version/report_html_url/byte_size` (§8, documented; DATABASE_SCHEMA.md + api-contracts.md updated). New deps: `handlebars`, `decimal.js`, `puppeteer`. Secrets grep clean; no `VITE_*`/`EXPO_PUBLIC_*` secret. **No open BLOCKED items** — the live Puppeteer render (Chromium 154 installed) and `supabase db reset` (18 migrations from scratch, pgTAP 78/78) both now pass locally. Working tree only — not committed (owned by `/commit`). |
| 10 | Audit & Integrity Surfacing | 🟨 implemented | 🟨 green (local) on `phase/10` — api vitest **186/186** (+18 Phase 10), whole-workspace typecheck 8/8 · lint 8/8 · test 8/8 (dashboard 64, +12 Phase 10); **`supabase db reset` PASSES** (all 19 migrations from scratch) and **`supabase test db` = pgTAP 86/86** (+8: `07_chain_verification.sql` proves the SQL range verifier catches a tampered value as `hash_mismatch` naming the row, a deleted intermediate row as a `broken_link` gap, and that the receipt leaks no `org_id`); `information_schema`/`pg_proc` confirms both new functions exist. 5-minute manual audit deferred to user review. | `apps/api` + `apps/dashboard` Phase-10 audit & integrity surfacing. Task 1 **Integrity endpoint** already delivered in Phase 8 (`routes/integrity.ts` + `asset_integrity` fn, tri-state per-check, §3.7). New: **Chain verifier** — SQL `verify_audit_chain_range(asset, from, to)` recomputes every row's content hash byte-identical to `append_audit_log` (native microsecond `hashed_at`, §3.8) + link/gap check, composed in Node with an RFC 8785 `details`-consistency check that catches a raw-`details` tamper the hash-over-`details_canonical` misses (`services/chain-verifier.ts`, `GET /v1/assets/:id/verify-chain` via `routes/verification.ts`); **Report verification** — public-safe `report_verification_receipt` (`GET /v1/reports/:id/verification`) returning only hashes/timestamps/chain-verdicts, no `org_id`/user/GPS/caption/public_id, `SECURITY INVOKER` so cross-org → 404 (asserted); **Integrity viewer UI** — `features/integrity/` chain visualization (names the tampered row/gap), timestamp comparison (skew honestly `unknown`, never `pass`), and a deterministic exportable verification record that re-verifies byte-identically on a second run (`ChainVisualization.tsx`, `TimestampComparison.tsx`, `VerificationExportButton.tsx`, `IntegrityViewer.tsx`, `verificationRecord.ts`, `hooks/useVerification.ts`). New migration `20260930020000_chain_verification.sql` (two functions, no new table/column). Docs updated (`api-contracts.md`, `DATABASE_SCHEMA.md`). Secrets grep clean; no `VITE_*`/`EXPO_PUBLIC_*` secret. **BLOCKED (needs user review):** the 5-minute manual audit on a generated report. Working tree only — not committed (owned by `/commit`). |
| 11 | Hardening & Release | 🟨 implemented | 🟨 automated gate green on `phase/11`; criteria 3/4/6 now automated, 1/2/5/8/9 documented+deferred | Per-org upload rate limit + §3.5 log-PII test + doc↔reality (endpoint + live schema) gate + API 80%/ML 70% enforced coverage + per-service CI + secrets gate all green locally. **MVP exit criteria: 3, 4, 6 have automated tests** (`search-perf.integration.test.ts`, `test_exit_criterion_4.py`, `test_exit_criterion_6.py`); **1, 2, 5, 8, 9 documented in `docs/operations/MVP_EXIT_MANUAL_CHECKLIST.md`** and remain BLOCKED (needs user review). Monitoring (OTel/Sentry/alerts), preview envs, platform env population, and staging deploys remain BLOCKED. Not committed. |

**Last updated:** 2026-09-30 · **Phase 11 — MVP exit criteria: 3/4/6 automated, 1/2/5/8/9 documented+deferred** on branch `phase/11` (continuation). Closed part of exit-criterion blocker #1 by adding real, runner-native tests that fail if the property is violated: **Criterion 3** — `apps/api/src/routes/search-perf.integration.test.ts` seeds 1 000 assets in a rolled-back transaction and asserts every `search_assets` filter path (tag/location/date/GPS-accuracy/asset-type) takes an **index scan, not a seq scan** (`enable_seqscan=off` reveals index applicability on a small table); wall-clock is logged (all sub-2ms dev-hardware) but staging confirmation of <500ms stays a user-review item. This needed a **schema addition (§8, documented)**: migration `20260930030000_search_indexes.sql` adds `idx_assets_ai_tags` (GIN jsonb_path_ops), `idx_assets_asset_type`, `idx_assets_capture_time` — the three filter paths that previously seq-scanned; additive/index-only, no evidence column or RLS touched, documented in `DATABASE_SCHEMA.md`. **Criterion 4** — `apps/ml-service/tests/test_exit_criterion_4.py` runs 5 photo pairs (`/v1/detect-change`, asserts a diff-image artifact uploaded) + 3 video pairs (`/v1/detect-change-video`, asserts per-keyframe change metrics), and enforces that **every** emitted metric carries a `model_version` resolving to a **trained** `model_registry` row (§3.2) — a null/absent version fails outright. **Criterion 6** — `apps/ml-service/tests/test_exit_criterion_6.py` asserts 3 observation types each route to their **own** registry key (forestry trained → its model; water/infrastructure registered-but-untrained → `unsupported`, never a forestry fallback) plus the **mandatory negative case**: an unregistered type returns `{"status":"unsupported"}` with no metrics/model_version (fails the instant a cross-sector fallback is introduced, §3.3). §8 respected — only forestry has a trained model, so untrained sectors ship `unsupported`; none fabricated. **Group B** — `docs/operations/MVP_EXIT_MANUAL_CHECKLIST.md` documents criteria **1, 2, 5, 8, 9** (device/staging/stopwatch/auditor), the evidence to capture, and why an agent cannot self-certify (§7.1); `MVP_EXIT_CRITERIA.md` updated with a status column. **Gate:** criterion-3 bench **PASS** (api vitest **222/222**, coverage 92.6%/80.1%/97.1% still ≥80, exit 0), criteria 4+6 **PASS** (ml **pytest 70 passed · 1 skipped**, ruff+mypy clean, coverage **91.5%** ≥70); `supabase db reset` applies all **20** migrations from scratch and `supabase test db` = **pgTAP 86/86**; doc↔reality live check green (13 tables / 24 endpoints). **BLOCKED (needs user review):** criteria 1, 2, 5, 8, 9 (per the manual checklist), full CI green on GitHub, and staging deploys. Working tree only — not committed (owned by `/commit`).

**Last updated:** 2026-09-30 · **Phase 11 — Hardening & Release implemented** on branch `phase/11` (branched from `main`, which has Phases 1–10 merged; dependency work confirmed present — all 19 migrations, `apps/api/src/routes/*`, `apps/ml-service/src/*`, and the dashboard are on the branch). Delivered against the Phase 11 task table: **Rate limiting** — a per-org upload ceiling on the webhook ingest (`lib/org-rate-limit.ts`, wired in `app.ts` + `routes/webhooks/cloudinary.ts`, config `ORG_UPLOAD_RATE_MAX`/`_WINDOW_MS`), keyed on the org derived from the **signed** project_id so a flood on one tenant returns `429`+`Retry-After` without denying another (unsigned-preset abuse mitigation). **Test suite** — enforced coverage: `apps/api/vitest.config.ts` fails the build under 80% (now **92.6% stmt / 80.1% branch / 97.1% func**, 217 tests), `apps/ml-service/pyproject.toml` `--cov-fail-under=70` (now **89.5%**, via `pytest-cov`); added `config.test.ts`, `org-rate-limit.test.ts`, `doc-consistency.test.ts`, `hardening.integration.test.ts`, ML `test_logging.py`. **CI/CD** — `.github/workflows/ci.yml` rebuilt into per-service jobs (api/ml/dashboard/capture/packages) so one service can't mask another, plus a **migration-gate** job (`supabase db reset` → `check:docs` against live `information_schema` → `supabase test db`) and a **secrets** job. **Monitoring** — structured JSON logging for the ML service (`src/logging_config.py` + request middleware, never logs the internal JWT/GPS); API Pino redaction extended to GPS (`gps_lat`/`gps_lon`/`gps`). **Secrets** — `scripts/check-secrets.sh` (pattern-based, `<angle-bracket>` placeholders excluded) green; deployment/README/PRD placeholders sanitized; rotation schedule already in `ARCHITECTURE.md`. **Docs** — `api-contracts.md` (per-org upload limit + reconciled the never-implemented `audit-trail` endpoint to the Phase 10 verify-chain), `ENVIRONMENT.md`, `.env.example`, `README.md` exit-criteria pointer; a script now asserts docs name only tables/columns/endpoints that exist. **MVP exit criteria** — walked PRD §12 / `MVP_EXIT_CRITERIA.md`. **Gate:** G1 secrets **PASS**, G2 migration gate **PASS** (live schema check green + negative "catches a missing table" unit test), G3 per-org rate limit **PASS**, G4 log-PII **PASS**, G5 coverage **PASS** (API 80% / ML 70% enforced), G6 per-service build **PASS** / independent *deploy* **BLOCKED (needs staging)**, G7 docs-match **PASS**, G8 task completeness **PARTIAL** (monitoring OTel/Sentry/alerts, preview envs, platform env population, and E2E-on-the-9 need staging/credentials). Whole-workspace **typecheck 8/8 · lint 8/8 · test 8/8 · build**; `supabase db reset` applies all 19 migrations and `supabase test db` = **pgTAP 86/86**. **BLOCKED (needs user review):** all 9 `MVP_EXIT_CRITERIA.md` criteria (timing/device/deploy/seeded-run verification), full CI green on GitHub, and staging deploys for all 4 services. Working tree only — not committed (owned by `/commit`). *(Pre-existing carried edits from earlier phases, e.g. `.opencode/command/commit.md`, left untouched.)*

**Last updated:** 2026-09-30 · **Phase 10 — Audit & Integrity Surfacing implemented** on branch `phase/10` (branched from `main`, which has Phases 1–9 merged; dependencies Phase 3 API core, Phase 8 dashboard + integrity endpoint, and Phase 9 report generation confirmed present on this branch via `main` — `apps/api/src/reports/*` and migrations through `20260930010000_report_generation.sql` are on the branch). Delivered against the Phase 10 task table: **Integrity endpoint** (task 1) was already shipped in Phase 8 (`routes/integrity.ts` + `asset_integrity` SQL fn, full per-check `pass`/`fail`/`unknown`, §3.7) and satisfies the row as-is; **Chain verifier** (task 2, `verifyChain(from,to)`) — SQL `verify_audit_chain_range` does the authoritative hash + link/gap recomputation in Postgres byte-identical to `append_audit_log` (native microsecond `hashed_at`, §3.8), composed in Node with an RFC 8785 `details`-consistency check so a raw-`details` tamper (invisible to the hash over `details_canonical`) is caught too (`services/chain-verifier.ts`, `GET /v1/assets/:id/verify-chain` in `routes/verification.ts`); **Integrity viewer UI** (task 3) — chain visualization naming the tampered row/gap, timestamp comparison (skew honestly `unknown`, never `pass`), and a deterministic **exportable verification record** that re-verifies byte-identically on a second run (`features/integrity/components/{ChainVisualization,TimestampComparison,VerificationExportButton,IntegrityViewer}.tsx`, `verificationRecord.ts`, `hooks/useVerification.ts`); **Report verification** (task 4) — public-safe `GET /v1/reports/:id/verification` receipt returning only hashes/timestamps/chain-verdicts, no `org_id`/user/GPS/caption/public_id, `SECURITY INVOKER` so cross-org → 404. Gate: **api vitest 186/186** (+18), **dashboard vitest 64/64** (+12), **whole-workspace typecheck 8/8 · lint 8/8 · test 8/8**; **`supabase db reset` PASSES** (19 migrations from scratch) and **`supabase test db` = pgTAP 86/86** (+8 in `07_chain_verification.sql`: intact chain passes; a tampered value → `hash_mismatch` naming that row; a deleted intermediate row → `broken_link` gap named at the successor; the receipt leaks no `org_id`); `pg_proc` confirms both new functions exist. New migration `20260930020000_chain_verification.sql` adds two functions (no new table/column). Docs updated (`api-contracts.md`, `DATABASE_SCHEMA.md`). Secrets grep clean; no `VITE_*`/`EXPO_PUBLIC_*` secret. **BLOCKED (needs user review):** the 5-minute end-to-end manual audit on a generated report. Working tree only — not committed (owned by `/commit`). *(The intentionally-carried `.opencode/command/commit.md` edit is left in place for the Phase 10 commit, per the user's decision.)*

**Last updated:** 2026-09-30 · **Phase 9 — Reports implemented** on branch `phase/9` (branched from `main`, which has Phases 1–8 merged; dependencies Phase 5 derivative writer, Phase 7 change_events, Phase 8 dashboard/read routes confirmed present on this branch). Delivered against the Phase 9 task table: Handlebars template + pinned `template_version`, integrity appendix (hash-chain excerpt + per-asset signature/EXIF/caption status + timestamp comparison + model versions), verification gate (refuses any non-`verified` asset), Puppeteer→PDF renderer with Inter-font embedding + Cloudinary artifact upload + stored template/input ids for regeneration, self-contained artifact (base64 data-URI inlining of a `report_full` derivative capped 1920px, offline), one `report_manifest_entries` row per inlined element with the embedded-bytes SHA-256, video keyframe posters + recorded clip transformation strings, gen-AI derivatives applied **only** to report copies (`is_generative=true`, never an original), async gen-AI BullMQ job (`POST /v1/reports/generate` returns report + manifest and does not block on 420/423 gen-AI), and Decimal.js determinism. Gate: **api vitest 168/168** (+25: 4 report-metrics, 6 assemble, 6 report-generation, 3 report-genai, 4 reports route, **2 live Puppeteer render** — includes the 7 named gate assertions: quarantined-asset rejection, gen-AI is_generative+parent link, appendix current_hash==DB, offline render, byte-identical regeneration, manifest sha256==embedded bytes, gen-AI never on an original public_id); **whole-workspace typecheck 8/8, lint 8/8, test 8/8**; secrets grep clean, no `VITE_*`/`EXPO_PUBLIC_*` secret. **Live Puppeteer→PDF render UNBLOCKED & PASSING:** Chromium 154 installed via `npx puppeteer browsers install chrome`; `reports/renderer.live.test.ts` renders the self-contained HTML offline to a valid `%PDF-` and proves byte-identical PDFs from identical HTML (7089-byte smoke + full-report render both green). **`supabase db reset` UNBLOCKED & PASSING:** the earlier schema-init container failure was transient (the local stack had not fully come up); with the stack healthy, `supabase db reset --local` applies all **18** migrations from scratch through `20260930010000_report_generation.sql`, `supabase test db` = **pgTAP 78/78** (every prior phase's RLS/immutability/audit tests still green — the additive Phase 9 migration breaks nothing), and `information_schema` confirms the 4 new `evidence_packages` columns (`template_id uuid`, `template_version text`, `report_html_url text`, `byte_size bigint`, all nullable). Docs updated (`api-contracts.md`, `DATABASE_SCHEMA.md`). **No open BLOCKED items for this phase.** Working tree only — not committed (owned by `/commit`). *(`.opencode/opencode.jsonc` remains a pre-existing model-routing edit, not part of this phase.)*

**Last updated:** 2026-09-29 · **Phase 8 browser E2E now PASS — JWKS/ES256 auth + CORS implemented** on branch `phase/8` (continuation; the earlier follow-up #1 is DONE). Two real gaps the live browser run surfaced were fixed: (1) **API JWT verification** now accepts Supabase's asymmetric **ES256/RS256** tokens via the project **JWKS** (kid-selected, cached), with HS256 kept as a legacy/test fallback — verification runs in an async `preHandler` so `authenticate`/`requireRole` stay synchronous and no route changed (`plugins/auth.ts`, `auth.jwks.test.ts`); (2) **CORS** added (`@fastify/cors` locked to `DASHBOARD_URL`; dev allows localhost/127.0.0.1) — without it the SPA got "Failed to fetch". Gate: **whole-workspace typecheck 8/8, lint 8/8, test 8/8** (api **143** incl. +4 JWKS, dashboard 52, capture 62, shared 64, ui 1, ml 59/1-skip); `@fastify/cors` added to `apps/api/package.json`. **Live browser E2E (both Phase 8 gate flows) PASS** — `pnpm --filter @impact/dashboard exec playwright test` → `2 passed` (EXIT 0): (a) login → pick project → search by tag → open asset → **integrity panel `pass`**; (b) quarantined asset visible in the admin queue. Playwright `webServer` self-manages the API launcher + Vite dev server, so the run is one foreground process. Independently, an in-process live self-check (`e2e-scripts/e2e-verify.ts`) reported **ALL LIVE CHECKS PASSED** (7/7: real ES256 login, `/v1/projects` RLS-scoped, `/v1/search` facets, integrity all-true verdict, change-events, derivatives, unauth→401). **§3.10 preserved:** `config.toml` `enable_signup` stays `false` in the commit; reproducing the browser login locally needs it toggled true for the *running local stack only* (the CLI couples `EXTERNAL_EMAIL_ENABLED` to it — finding #3 below; production/Supabase-cloud is unaffected since login ≠ signup there). Working tree only — not committed (owned by `/commit`).

**Last updated:** 2026-09-29 · **Phase 8 E2E enablement + missing-endpoint implementation** on branch `phase/8` (continuation). Per the user's decision to "build them on `phase/8` anyway", the API endpoints the dashboard consumes were implemented (Phase 3/5 scope pulled forward): `GET /v1/search` (`routes/search.ts` + `search_assets` SQL fn), `GET /v1/projects/:id/change-events` + `GET /v1/assets/:id/derivatives` (`routes/reads.ts`), and the integrity endpoint reshaped to its **documented flat contract** (`routes/integrity.ts` + `asset_integrity` SQL fn; the Ed25519 + RFC 8785 checks run in Node via `resolveIntegrityContract`, §3.7-honest — a missing input is `unknown`, never a false `pass`). Ports/adapters/fakes extended (`ports.ts`, `plugins/supabase.ts`, `testing/fakes.ts`); method renamed `assets.searchAssets` so the §3.9 no-Cloudinary-Search guardrail grep (`.search(`) still holds. **New migrations** `20260929010000_access_token_hook.sql`, `20260929020000_search_assets.sql`, `20260929030000_asset_integrity.sql` — `supabase db reset` applies all 17 clean. Gate: **api vitest 139/139** (+15 new), **whole-workspace typecheck 8/8, lint 8/8, test 8/8** (api 139 · dashboard 52 · capture-app 62 · shared 64 · ui 1 · ml 59/1-skip); secrets grep clean, no `VITE_*`/`EXPO_PUBLIC_*` secret. Docs updated (`api-contracts.md`: derivatives + integrity now implemented). **Live-stack verification (local Supabase):** `search_assets` and `asset_integrity` run correctly under RLS against real Postgres with seeded data; the two Node crypto checks both return `pass` for a genuinely-signed seeded asset → integrity verdict `pass` end to end.

**§3-adjacent FINDINGS surfaced by running the real stack (flag for the user):**
1. **RLS could not see `org_id` for real tokens (fixed).** Every RLS policy reads `auth.jwt() ->> 'org_id'` (a top-level claim), but GoTrue nests the invite-time claim under `app_metadata`, so a real token returned **0 rows** (proven empirically: nested→0, top-level→1). ARCHITECTURE.md §"Row isolation" asserts "No Custom Access Token Hook … is required" — that is wrong for Postgres RLS. Fixed with a **custom access token hook** (`public.custom_access_token_hook`, migration `20260929010000`, enabled in `config.toml`) that hoists `app_metadata.org_id`→top-level `org_id` (and `role`→non-reserved `app_role`, never clobbering PostgREST's `role`). Verified: a real signed-in token now carries top-level `org_id`. The Carry-over "No `org_members` table" decision should be updated — the hook, not just app_metadata, is what makes that decision hold.
2. **API JWT verification is HS256-only; modern Supabase issues ES256 (BLOCKS the browser E2E).** GoTrue v2.197 signs access tokens with an asymmetric ES256 JWKS key; `apps/api/src/plugins/auth.ts` `verifySupabaseJwt` only accepts HS256 with `SUPABASE_JWT_SECRET`, so it rejects real browser tokens. This is a real Phase 3 gap — the fix is to verify via the project JWKS (ES256/RS256). Until then the dashboard's live login→API path cannot complete, so the 2 Playwright flows stay BLOCKED. (The SQL + RLS + crypto layers are all verified independently above with a self-minted HS256 token / direct SQL.)
3. **Local CLI couples email login to `enable_signup`.** The Supabase CLI sets `GOTRUE_EXTERNAL_EMAIL_ENABLED` from `[auth.email] enable_signup`; with §3.10's `enable_signup=false`, password login is refused locally (`email_provider_disabled`). Left `enable_signup=false` (invariant preserved) — running the browser E2E locally needs it toggled true for the local stack only. Not a production concern (prod uses Supabase cloud where login ≠ signup).

E2E harness added under `apps/api/e2e-scripts/` (`e2e-api.ts` launcher, `e2e-seed.ts` signed-asset + user seed; local demo keys only, no real secrets); `apps/dashboard/.env.local` (gitignored) points the dashboard at the local stack. Working tree only — not committed (owned by `/commit`). *(Note: `.opencode/opencode.jsonc` shows a pre-existing model-routing edit not made as part of this phase.)*

**Last updated:** 2026-09-29 · **Phase 8 — Dashboard Core implemented** on branch `phase/8` (branched from `main`, which has Phases 1–7 merged; dependencies Phase 1 migrations and Phase 3 API routes confirmed present on this branch). Delivered against the Phase 8 task table: app shell + auth gate + org/project context (`shared/auth/AuthContext.tsx`, `shared/providers/AppProviders.tsx`, `layouts/*`, `App.tsx`); Supabase anon client + Realtime helper (`shared/supabase/client.ts`, `shared/realtime/subscribe.ts`, `RealtimeBridge.tsx`); TanStack Query layer with the query-key factory (`shared/queryKeys.ts`) and the pure invalidation mapping (`shared/realtime/invalidation.ts`); project tree with badges (`features/projects/*`); search + 7 facets (`features/search/*`); MapLibre map (`features/map/*`); asset detail with integrity panel + derivative lineage (`features/assets/*`, `features/integrity/*`); change review with model-version metrics (`features/change-events/*`); admin quarantine queue (`features/admin/*`). Dashboard-only work — no `apps/api`, `apps/ml-service`, `apps/capture-app`, `packages/*` source touched (only dashboard `package.json` + root `pnpm-lock.yaml` for new deps: `@supabase/supabase-js`, `react-router-dom`, and dev-only `jsdom`, `@testing-library/*`, `@playwright/test`). Gate: **dashboard vitest 52/52**, lint/typecheck/build clean; whole-workspace `typecheck` (8/8) and `lint` (8/8) and `test` (8/8) green — the previously-noted dashboard typecheck FAIL is fixed. Secrets grep clean; no `VITE_*` secret. **BLOCKED (needs user review):** 2 Playwright E2E flows and the Realtime device check (scaffolded in `apps/dashboard/e2e/` + `playwright.config.ts`, `test.skip` without a live stack). Working tree only — not committed (owned by `/commit`).

**Last updated:** 2026-09-28 · **Phase 7 — Pairing & Change Events implemented** on branch `phase/7` (branched from `phase/6` per the user's explicit decision; the intentionally-carried Phase 6/6.5 `BUILD_ORDER.md` edit is left in place for the Phase 7 commit). Delivered against the Phase 7 task table: the pure pairing algorithm (`services/pairing.ts`), the `pair-assets` (`services/pair-assets.ts`) and `detect-change` (`services/change-detection.ts`) worker logic, the metric-schema write-time gate (`lib/change-metrics-schema.ts`), and the manual link/split override endpoints (`routes/pairs.ts`) — all behind the existing injectable ports and driven by in-memory fakes; BullMQ worker entrypoint at `jobs/workers.ts`. New migration `20260927140000` adds the `change_events` pairing lifecycle (`status`/`failure_reason` + a CHECK tying a reason to `failed` + idempotency unique index `uq_change_events_pair`) and the `assets_for_pairing` SQL function (§8 schema change, documented; DATABASE_SCHEMA.md + api-contracts.md updated). `model_version` stays NOT NULL — failed/manual rows carry a non-model sentinel (`none`/`manual`) with empty metrics, so §3.2 is not weakened. Gate: **api vitest 124/124** (9 pairing + 7 metric-schema + 9 change-detection + 6 manual-override, plus the prior 93), **shared vitest 64/64**, `supabase db reset` applies all 14 migrations clean, **pgTAP 78/78** (the new `06_manual_pairing_audit.sql` adds 6 assertions proving the manual relink/split path extends the hash chain and tampering breaks it; the prior 72 still green — additive migration broke nothing), `information_schema` confirms the new columns/CHECKs/index/function exist, lint/typecheck/build clean for `@impact/shared` + `@impact/api`, secrets grep clean. **Pre-existing, out-of-scope FAIL:** `@impact/dashboard` `pnpm typecheck` fails at `vite.config.ts` on a duplicate-Vite-version type conflict — unrelated to Phase 7 (no dashboard file touched). **BLOCKED (needs user review):** the live-DB human sign-off of "manual relink appends to the audit chain" — the automated pgTAP proof above covers chain integrity, but the deferred item's human-run inspection against real infrastructure cannot be self-certified by an agent (§7.1). Working tree only — not committed (owned by `/commit`).

**Last updated:** 2026-09-28 · Added **Phase 6.5 — Forestry Model Fine-Tuning** (user-run, demo-optional): the well-defined, GPU-executed phase that replaces the forestry placeholder baseline with real fine-tuned weights and flips the `model_registry` row. Doc edit on branch `phase/6` (uncommitted). · Phase 6 ML Service **implemented** on branch `phase/6` (committed as `e9f827f`; the live-DB `model_version=NULL` rejection now PASSES against `uypmapvrttnkjnzjlotj` via the IPv4 pooler — full gate **12 PASS · 0 FAIL · 0 BLOCKED**). Branched from `main` at `7c42617` (Phase 5 merged — dependency Phase 2 shared package confirmed present via `packages/shared/fixtures/jcs-cross-language.json`). Delivered against the Phase 6 task table: FastAPI app + 6 endpoints, `(key,version)`-cached registry loader with the trained-status gate and no cross-sector fallback, forestry YOLOv8n+ChangeFormer path (lazy torch/ultralytics) plus a deterministic baseline for the `weights_uri IS NULL` placeholder, the GPS-GSD quantifier, local red-overlay diff + SDK-signed upload, the ffmpeg→ORB→homography video pipeline, the Python JCS port (byte-identical to `packages/shared`, closing the Phase 2 carry-over), internal-JWT auth, and the SSRF guard. A `.venv` (uv, CPython 3.11.16) was created under `apps/ml-service/.venv` (gitignored) and the runtime+dev deps installed (fastapi, pydantic, python-jose, numpy, opencv-python-headless, pillow, httpx, cloudinary; ruff/mypy/pytest); torch/ultralytics are declared in `requirements.txt` but lazy-imported so the gate runs without them. Gate: **pytest 59 passed · 1 skipped (60 collected)**, **ruff clean**, **mypy --strict clean** (19 files); the 30s-video item runs against a real ffmpeg `testsrc` fixture (ffmpeg 8.x present in this env). Secrets grep clean (only env-var *names* + `.env.example` placeholders, no values). **BLOCKED (needs user review):** the live-DB `model_version=NULL` rejection (set `ML_TEST_DATABASE_URL` to run it against the Phase-5 live Supabase project) and real fine-tuned forestry weights.

**(Phase 5)** (not committed; owned by `/commit`). Branched from `main` at `3c1e842` (Phase 4 merged). Delivered against the Phase 5 task table: named + generative transform catalogue and video clip helper, `verified_capture` preset + retention policy, the `createDerivative` derivative writer (append-only lineage + audit + generative-on-report-copy guard + async `pending`), SDK-only signing with an in-repo no-hand-rolled-signing / no-Cloudinary-as-DB guardrail test, AI tags → `observations` at ingest, and the nightly reconciliation job (orphans/missing + `bytes_used` recompute, which resolves the Phase 3 quota carry-over). Capture-app carry-over honoured: real `/v1/projects` with a JWT bearer, DEV seed behind an explicit flag, org/auth JWT-derived (§3.4). Gate: **api 93/93, capture-app 62/62** vitest; lint/typecheck/build clean across shared, ui-components, api, capture-app (lib+app). Phase 5 dependency (Phase 3) confirmed present on `main`. **Live-Cloudinary follow-up (2026-09-28, post-commit `daeddd4`):** user provided cloud `o2ystfbm`; created gitignored `apps/api/.env.local` from `ENVIRONMENT.md`; ran `setup:preset` live → `verified_capture` created + verified against the real Admin API; `reconcile` reached the live Admin resource-listing and failed only at the un-applied `public.assets` table (known blocker #1). **Then (same day):** user supplied a Supabase access token + DB password; all 13 migrations pushed to the live project via `supabase link` + `db push --yes` (`migration list` now Local==Remote — clears known blocker #1), and `pnpm reconcile` runs live end-to-end (`checked_resources:60, orphans:60, missing:0`). Live generative probe (bounded, per user go-ahead) proved `e_gen_*` is enabled and **caught + fixed** an async-status bug: Cloudinary returns `status:'processing'` for async generative eager work, which the adapter mis-read as ready; fixed via `isEagerPending()` + 6 regression tests (api now 93/93). NOTE for user: `apps/api/src/config.ts` requires `SUPABASE_JWT_SECRET` (min 1), but `ENVIRONMENT.md` §2 states that var does not exist (JWTs are verified via `auth.getUser()`); a placeholder is set in `.env.local` so `loadConfig()` passes — reconcile the schema vs the doc. Prior Phase 4 note retained below.

**(Phase 4)** Phase 4 Capture App **implemented** on branch `phase/4` (not committed; owned by `/commit`), now with a **runnable Expo app layer** in addition to the platform-agnostic logic. Logic (unchanged behaviour, tests still 59/59): EXIF freeze + JCS `exif_hash`, streamed chunked SHA-256 (default hasher switched to pure-JS `@noble/hashes` so it runs under Node *and* React Native — digest byte-identical), honest Ed25519 `signature_tier` (`server` fallback, never relabelled `device`, §8), GPS gating + E7, hierarchical picker with inheritance, MMKV offline queue (`rejected` terminal, interrupted→resumable, `upload_started_at` before attempt §3.7, restart-safe), resumable sync, 30 s video cap. **Added on this branch:** Expo SDK 52 scaffold (`app.json`, `App.tsx`, `babel.config.js`, `metro.config.js`, root `index.ts`); native adapters for every port under `src/native/` (chunked `expo-file-system` reader, `@noble` streaming hasher, EXIF, `@noble/ed25519`+`expo-secure-store` signer, `react-native-mmkv` store, NetInfo monitor, device clock, `expo-location`, unsigned-preset Cloudinary uploader, runtime assembly, `expo-background-fetch`+NetInfo sync triggers); screens (`ProjectPickerScreen`, `CameraScreen` front/back + 30 s video, `QueueScreen`); tsconfig split (`tsconfig.lib.json` Node/vitest + `tsconfig.app.json` RN/JSX); `android/`/`ios/` gitignored (Continuous Native Generation). Local gate green: **test 59/59, lint, typecheck (lib), typecheck:app (RN), build** all clean; secrets grep clean; no `EXPO_PUBLIC_*` secret. **NEW BLOCKER — NOW RESOLVED & PROVEN:** the app previously could not Metro-bundle because `@impact/shared` statically imported `node:crypto`/`Buffer`. Fixed with a clean, non-breaking split of `@impact/shared` (Phase-2 code, edited here on `phase/4` — flag for your sync): (1) `hash.ts` `sha256Canonical` now uses pure-JS `@noble/hashes` (byte-identical to `node:crypto`); (2) `signing.ts` split into pure `signing-payload.ts` (`buildSigningPayload`, schemas, types — no `node:crypto`) + `signing.ts` (node Ed25519 `sign`/`verify`, re-exports the payload surface so the `.` barrel is unchanged for the API); (3) new pure `rn.ts` barrel + package `exports` `"./rn"`; the capture app imports `@impact/shared/rn` and verifies locally with `@noble/ed25519` instead of the node `verifyPayload`. **Non-breaking confirmed:** `@impact/shared` **64/64**, `@impact/api` **48/48**, `@impact/capture-app` **59/59** all still green; all four typechecks + lints clean. Device-bundle proof: `npx expo export --platform android` → `Android Bundled … (735 modules)`, exit 0. Two supporting config changes on this branch: root `.npmrc` gained `node-linker=hoisted` (Expo+pnpm requirement — **workspace-wide, flag for sync**) and `apps/capture-app/metro.config.js` maps TS `.js` ESM imports → source and enables package `exports`. **Still BLOCKED (needs a device / user review):** 3 device tests (airplane-mode 3-photo sync, kill/relaunch queue survival, post-signing caption edit) + hardware Keystore/Secure-Enclave Ed25519 (§8; until confirmed, `signature_tier='server'`). Marked implemented, not passed. Phases 0/2 (dependencies) confirmed present on `main`.

**Phase 4 emulator run (this session):** the app was built and run end-to-end on an Android emulator. `npx expo run:android` → Gradle `BUILD SUCCESSFUL in 6m21s` → APK installed → Metro `Android Bundled … (853 modules)` → app launched in bridgeless mode. A screenshot confirms the live UI: the **Camera** screen (emulator's simulated camera feed) with Flip/Photo/Video controls and the Picker·Camera·Queue tab bar — i.e. picker→camera→queue all render and navigate. Added on this branch to make the run possible without a backend: a **DEV-only seed project list** in `App.tsx` (used only when `EXPO_PUBLIC_API_URL` is unset; the real `/v1/projects` fetch is untouched) and `apps/capture-app/.env.local` (dummy Cloudinary creds, gitignored — **not committed**). Toolchain (JDK 17, Android SDK/AVD, emulator lib shims) was installed under `$HOME`, outside the repo. Log noise seen and confirmed benign: the `@noble/hashes/crypto.js` exports WARN (falls back fine) and a `react-native-web` web-bundle failure (web is not a target). **What this proves:** the app builds, bundles, launches, and the capture→sign→hash→queue pipeline runs on-device UI. **What it does NOT prove (still needs a physical phone):** real camera bytes, real GPS accuracy, hardware Keystore (`signature_tier='device'`), and the 3 deferred device tests — the emulator's fake camera / mock GPS / software signer cannot cover these.

**Phase 5 START carry-over (per user) — DONE on `phase/5`:** the capture app now loads the live `GET /v1/projects` with an `Authorization: Bearer <supabase-jwt>` (token read from the secure store via `src/native/session.ts`; a Phase 8 login deposits it there), resolving `org_id`/auth from the verified JWT, never env/body (§3.4). The DEV seed is gated behind an explicit `EXPO_PUBLIC_DEV_SEED=1` opt-in — no silent fallback. Client (`src/api.ts`) validates rows at the boundary and fails loudly on non-2xx. Remaining: an actual on-device run against a running `@impact/api` needs a Supabase login (Phase 8) to mint the JWT — BLOCKED (needs user review).
<!-- Prior (Phase 3): API core implemented on branch phase/3 — see git history for the full note. -->
**Blocked on user input:** generative transform budget cap · Cloudinary Free-plan generative availability · Phase 4 hardware Keystore/Secure-Enclave Ed25519 feasibility on the target device (§8) · **Phase 4 3 device tests (need a physical device)**
**Not yet done:** CI (`.github/workflows/ci.yml`) not yet executed on a real push · Phase 1 not yet committed (owned by `/commit`) · Phase 2 cross-language JCS parity **now delivered by the Phase 6 Python port** (`apps/ml-service/src/canonicalize.py`, asserted against the shared fixture) · Phase 5 live-Cloudinary/Redis/Supabase e2e + on-device capture→real-API run (owned by user review)

### Follow-ups (tracked, not blocking their phase's implemented status)

- **[DONE 2026-09-29 · API auth] Verify Supabase JWTs via JWKS (ES256/RS256), with HS256 fallback.** `apps/api/src/plugins/auth.ts` now has `verifySupabaseJwtAsync` + a `JwksCache`: an ES256/RS256 token is verified against the project JWKS public key selected by the header `kid` (fetched from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cached, one refetch on an unknown kid); an HS256 token still verifies with `SUPABASE_JWT_SECRET` (legacy/test). Verification moved to a global `preHandler` hook (async) that stashes the identity on `request.auth`; `authenticate`/`requireRole` stay synchronous readers, so no route changed. `extractIdentity` reads `org_id`/`role` from `app_metadata` first, then top-level `org_id`/`app_role` (the hook's hoisted claims), never the reserved `role`. Tests: `apps/api/src/plugins/auth.jwks.test.ts` (4 — ES256 verify, hoisted-claim shape, unknown-kid 401, HS256 fallback). **Also fixed a second real gap found by the browser run: the API sent no CORS headers, so the SPA got "Failed to fetch".** Added `@fastify/cors` locked to `DASHBOARD_URL` (dev also allows any localhost/127.0.0.1 port; Bearer auth so no credentials). **Both Phase 8 browser E2E flows now PASS** against the live local stack (`pnpm exec playwright test` → `2 passed`, EXIT 0).
- **[FOLLOW-UP · docs] Reconcile ARCHITECTURE.md §"Row isolation".** It states "No Custom Access Token Hook … is required"; running the real stack proved RLS (`auth.jwt() ->> 'org_id'`) cannot see the app_metadata-nested claim, so the hook (migration `20260929010000`) IS required. Update the prose + the "No `org_members` table" carry-over to reference the hook.
- **[FOLLOW-UP · local dev only] Email login vs `enable_signup`.** The Supabase CLI derives `GOTRUE_EXTERNAL_EMAIL_ENABLED` from `[auth.email] enable_signup`; §3.10 keeps it `false`, which refuses local password login. Toggle it true for the **local** stack only when running the browser E2E; production (Supabase cloud) is unaffected (login ≠ signup there).

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

## Phase 6.5 — Forestry Model Fine-Tuning (user-run)

**Depends on:** Phase 6 · **optional for the MVP demo** — see the note below
**Goal:** Replace the forestry `v1-placeholder` baseline with real fine-tuned
weights, so every forestry metric originates from a trained CV model (§3.2) and
not the deterministic stand-in.

**Why this is its own phase — and why it is optional for the demo.** Phase 6
ships forestry as a *trained placeholder*: the `model_registry` forestry row has
`weights_uri IS NULL`, so the service runs a deterministic classical-CV baseline
(`apps/ml-service/src/models/synthetic.py`). That is honest and lets the entire
capture → detect → report pipeline run end-to-end with **no GPU and no
datasets**. It is **not** production-grade — those numbers are a baseline, not a
fine-tuned model. This phase produces the real weights.

**The split of labour is the point of this phase.** Training needs a GPU and the
public datasets, so *you* run it. The agent's job is to scaffold the
training / evaluation / export / registry-update scripts on the branch so the
commands below are ready to run; *you* execute the training run, upload the
weights, and flip the registry row. Every step that needs a GPU or a credential
is `BLOCKED (needs user review)` for the agent, by design.

**Do this phase when** you want real forestry numbers in a demo or a Phase 9
report. You may present the MVP walkthrough on the placeholder, but any forestry
metric shown as *real* must come from here first (§3.2). Nothing downstream is
blocked on it — Phases 7–11 all run on the placeholder.

| Task | Detail | Who runs it |
|------|--------|-------------|
| Training deps | A separate `apps/ml-service/training/requirements.txt` (`ultralytics`, `torch`+CUDA, `albumentations`, `opencv`, `pyyaml`) — kept out of the service image; training is **not** in the Docker runtime (`FILE_STRUCTURE.md`). | agent scaffolds |
| Training config | `apps/ml-service/training/config.py` — one place for every hyperparameter (epochs, `imgsz`, batch, seed, augmentation, class names, dataset paths). The trainers import from here rather than hard-coding. | agent scaffolds |
| Dataset download | `training/data/download_forestnet.py` (ForestNet, ICCV 2019, ~1.2M patches) and `training/data/download_levir_cd.py` (LEVIR-CD, ~637 before/after pairs). **Public datasets only** — no proprietary or PII imagery. | agent scaffolds · user runs |
| Data prep | `training/data/prepare_yolo.py` → YOLO layout + `dataset.yaml` (`nc: 1`, `names: ['sapling']`); `training/data/augment.py` (Albumentations for field conditions). | agent scaffolds · user runs |
| Train sapling detector | `training/train_sapling_yolo.py` — YOLOv8n (COCO) base, 50 epochs, `imgsz=640`, `batch=16`, fixed seed → **`sapling_yolov8n.pt`** (~2 hrs on a T4). | user runs (GPU) |
| Train change detector | `training/train_change_detector.py` — ChangeFormer on LEVIR-CD + pilot pairs, 30 epochs → **`changeformer.pt`** (~1 hr on a T4). | user runs (GPU) |
| Evaluate | `training/evaluate.py` — sapling mAP50 / mAP50-95, change IoU / F1. Emits a JSON eval report. | agent scaffolds · user runs |
| Export (optional) | `training/export_onnx.py` — ONNX (`opset=12`, simplify) for production inference. | agent scaffolds · user runs |
| Publish weights | Upload `sapling_yolov8n.pt` + `changeformer.pt` to the **private** weights bucket, and make them present at `WEIGHTS_DIR` (default `/weights`) for the service container (`deployment.md` `COPY weights/`). The filenames must match `models/forestry.py`: `sapling_yolov8n.pt`, `changeformer.pt`, plus the free `yolov8n.pt` COCO base. Weights are **gitignored** (`.gitignore` covers `weights/`). | user runs (credential) |
| Flip the registry row | `training/promote_model.py` — a service-role `UPDATE` of the forestry `model_registry` row: set `weights_uri`, **bump `version`** (`v1-placeholder` → e.g. `v1.0`), and write the eval numbers into `metrics` JSONB. No client path (§3.10). | agent scaffolds · user runs (live DB) |
| Verify real weights load | With the weights present and `weights_uri` set, `default_factory` builds `YoloForestryModel`, **not** `SyntheticForestryModel` (`apps/ml-service/src/registry.py`). | agent test + user confirms live |

**Gate**
- The training / prep / eval / export / promote scripts exist under `apps/ml-service/training/` and pass `ruff` + `mypy --strict` like the rest of the service (agent-checkable).
- **Version bump is mandatory (§3.1/§3.2).** `weights_uri` is never set or changed without a new `version` string. `promote_model.py` refuses to reuse `v1-placeholder`. A test asserts the promote script rejects a no-op version. Historical `change_events` keep their **old** `model_version`; you never mutate past rows to point at new weights.
- **No cross-sector leakage (§3.3).** The promote step touches **only** the forestry row. Water / infrastructure / agriculture stay `unsupported`. A test asserts the `UPDATE` is scoped to `key = 'forestry'`.
- **Real weights actually take over (§3.2).** A test proves that when `weights_uri` is non-NULL the factory returns `YoloForestryModel`, and when NULL it returns `SyntheticForestryModel` — so a forgotten weight file cannot silently keep serving the baseline while the registry claims a trained version.
- **Determinism preserved.** Same input + same weights → identical metrics; the eval and training seeds are fixed. A metric that drifts run-to-run on frozen weights is a `FAIL`.
- **Source data is public and licensed.** ForestNet / LEVIR-CD usage is recorded; no proprietary or PII imagery is committed; the weight artifacts stay out of git.
- **Task completeness.** Every row of this phase's task table above is `DONE` (for the agent-scaffolded rows), with the implementing file named. Any `PARTIAL`, `MISSING`, or `BLOCKED` agent-row blocks `/commit`.

**Deferred to user review** — each needs a GPU, a bucket credential, or the live DB. The agent reports every one as `BLOCKED (needs user review)`, which blocks `/commit` on this phase until you run it and report the result.

- The sapling and change-detector **training runs** themselves (GPU).
- Uploading the two `.pt` files to the private weights bucket.
- The `model_registry` forestry-row flip against the live database.
- A post-flip live check: `GET /model-info` for forestry returns the bumped version with `status: trained`, and a `/detect-change` on a known pair returns that same `model_version` (not `v1-placeholder`).

### Scaffolding (the exact files this phase creates)

The agent scaffolds this tree under `apps/ml-service/training/`. It is a
**standalone** training workspace — its own `requirements.txt`, never imported by
`src/`, never in the Docker runtime image (`FILE_STRUCTURE.md`). Each file is a
runnable, `ruff`/`mypy --strict`-clean script with a `--help`.

```
apps/ml-service/training/
├── requirements.txt              # training-only deps: torch+CUDA, ultralytics, albumentations, opencv, pyyaml
├── config.py                     # ⭐ ALL tunable knobs in one place — see "Where to change model configs" below
├── data/
│   ├── download_forestnet.py     # fetch ForestNet patches            → training/data/forestnet/
│   ├── download_levir_cd.py      # fetch LEVIR-CD before/after pairs   → training/data/levir_cd/
│   ├── prepare_yolo.py           # convert to YOLO layout + write dataset.yaml (nc=1, names=['sapling'])
│   └── augment.py                # Albumentations field-condition augmentations (HSV, rotate, scale, flip)
├── train_sapling_yolo.py         # YOLOv8n fine-tune (50 epochs, imgsz 640)  → weights/forestry/sapling_yolov8n.pt
├── train_change_detector.py      # ChangeFormer train on LEVIR-CD (30 epochs) → weights/forestry/changeformer.pt
├── evaluate.py                   # sapling mAP50/mAP50-95 + change IoU/F1     → training/eval_report.json
├── export_onnx.py                # optional ONNX export (opset 12, simplify) for production inference
└── promote_model.py              # service-role UPDATE of the model_registry forestry row (bump version, set weights_uri, write metrics)
```

Output artifacts (all **gitignored** — `.gitignore` covers `weights/`):
`weights/forestry/sapling_yolov8n.pt`, `weights/forestry/changeformer.pt`, plus
the free `yolov8n.pt` COCO base. The filenames are **not free choices** — they
must match what `apps/ml-service/src/models/forestry.py` loads by name.

### Where to change model configs (the file you asked for)

There are three distinct "configs", and they live in different files. Use the
right one:

| You want to change… | File | Notes |
|---|---|---|
| **Which model the service uses, its `status`, `version`, `weights_uri`, eval `metrics`** — the *runtime* model config | **`supabase/migrations/20260927100000_model_registry_seed.sql`** (initial seed) · changed at runtime by **`apps/ml-service/training/promote_model.py`** | This is the real "model config": a `model_registry` row. The service is data-driven from it. `promote_model.py` is how you flip forestry from placeholder → `v1.0`. Never hand-edit an applied migration — new state goes through `promote_model.py`. |
| **Training hyperparameters** — epochs, image size, batch, augmentation, class names, dataset paths | **`apps/ml-service/training/config.py`** (the ⭐ above), consumed by `train_sapling_yolo.py` / `train_change_detector.py`; the YOLO dataset spec is the generated `training/data/forestnet_yolo/dataset.yaml` | This is where you tune the *training run*. Kept as one file so you are not editing hyperparameters scattered across scripts. |
| **Service/runtime environment** — `WEIGHTS_DIR`, Supabase URL, JWT secret | **`apps/ml-service/src/config.py`** (env-driven `Settings`) | Not the model; the service's environment. `WEIGHTS_DIR` (default `/weights`) is where the service reads the `.pt` files. |

**Short answer:** to change *the model* (which one, trained/unsupported,
version, weights location) the config lives in the **`model_registry`** row —
seeded at `supabase/migrations/20260927100000_model_registry_seed.sql` and
updated by **`apps/ml-service/training/promote_model.py`**. To change *how it
trains*, edit **`apps/ml-service/training/config.py`**.

### How to run it (step by step)

Run these on a machine with an NVIDIA GPU (a free Colab/Kaggle T4 is enough; total GPU cost is ~$3). Nothing here belongs in the service Docker image.

```bash
# 0. From the phase branch, in the ML service
cd apps/ml-service
python -m venv .venv-train && source .venv-train/bin/activate
pip install -r training/requirements.txt      # torch+CUDA, ultralytics, albumentations, ...

# 1. Fetch public datasets (no proprietary data)
python training/data/download_forestnet.py     # → training/data/forestnet/
python training/data/download_levir_cd.py       # → training/data/levir_cd/

# 2. Convert to the formats the trainers expect
python training/data/prepare_yolo.py            # → training/data/forestnet_yolo/dataset.yaml (nc=1, ['sapling'])

# 3. Train (GPU). Produces the two artifacts models/forestry.py loads by name.
python training/train_sapling_yolo.py           # → weights/forestry/sapling_yolov8n.pt   (50 epochs, imgsz 640)
python training/train_change_detector.py        # → weights/forestry/changeformer.pt      (30 epochs)

# 4. Evaluate and capture the numbers that will go into model_registry.metrics
python training/evaluate.py --out training/eval_report.json
#   → { "sapling": {"mAP50": ..., "mAP50_95": ...}, "change": {"iou": ..., "f1": ...} }

# 5. Put the weights where the service reads them (WEIGHTS_DIR, default /weights),
#    and upload the same files to the PRIVATE bucket for storage/provenance.
#    (Do NOT commit them — .gitignore covers weights/.)

# 6. Flip the registry row: bump version, set weights_uri, record metrics.
#    Service-role only; reads the DSN the same way the Phase 6 live test did.
python training/promote_model.py \
  --version v1.0 \
  --weights-uri "s3://<private-bucket>/forestry/v1.0/" \
  --metrics training/eval_report.json
#   → UPDATE model_registry SET version='v1.0', weights_uri=..., metrics=... WHERE key='forestry';

# 7. Verify: restart the service with WEIGHTS_DIR pointing at the weights, then
curl -s $ML_SERVICE_URL/model-info?key=forestry   # → {"version":"v1.0","status":"trained", ...}
```

After step 6 the service stops using `SyntheticForestryModel` and loads the real
`YoloForestryModel` on the next `(key, version)` cache miss — no code change, the
registry row drives it. Old `change_events` rows keep `v1-placeholder`; new
detections record `v1.0`.

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
