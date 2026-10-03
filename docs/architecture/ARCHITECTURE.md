# System Architecture

> **Panchnama** — a written record of inspection, signed by a witness.

**Version:** 1.0
**Status:** Approved for Development
**Audience:** Engineers, system architects, and technical auditors
**Related:** `docs/architecture/DATABASE_SCHEMA.md` (table DDL), `docs/architecture/api-contracts.md` (endpoint contracts)

---

## 1. Architectural Principles

These rules govern every implementation decision. If a design choice conflicts with one of these, the principle wins.

| # | Principle | Consequence |
|---|-----------|-------------|
| 1 | **Source evidence is never mutated** | Any resize, crop, gen-AI, caption, or re-encode writes a *new* Cloudinary derivative with its own asset row. Originals are write-once. |
| 2 | **Quantified metrics come from CV models, never LLMs** | An LLM may summarize already-computed metrics. It may not produce a number that appears in a report. |
| 3 | **Every number is traceable to a model version** | `change_events.model_version` is required. Untrained sectors return `unsupported`, never a fallback model's output. |
| 4 | **The client is untrusted** | The capture app signs, but the API re-verifies every signature and hash. Client-supplied metadata is a claim, not a fact. |
| 5 | **Offline is the normal case, not the exception** | No upload path requires connectivity. Sync is a separate, resumable concern. |
| 6 | **Org isolation is enforced in the database** | RLS on every table. The API additionally scopes queries; it is not the only barrier. |
| 7 | **Config drives sector behavior** | Adding an observation type or swapping a model is a database/config change, never a code deploy. |
| 8 | **Cloudinary is a media pipeline, not a database** | Supabase is the system of record. Every query the product serves runs against Postgres. See §3.2.1. |

---

## 2. Component Topology

```
┌──────────────────────────────────────────────────────────────────────┐
│  CLIENTS                                                             │
│  ┌────────────────┐                      ┌────────────────────────┐  │
│  │  Capture App   │                      │  Dashboard (Web)       │  │
│  │  Expo / RN     │                      │  React + Vite          │  │
│  │                │                      │  TanStack Query        │  │
│  │  camera, GPS   │                      │  MapLibre GL           │  │
│  │  Ed25519 keys  │                      │  Supabase Realtime     │  │
│  │  MMKV queue    │                      │                        │  │
│  └───────┬────────┘                      └───────────┬────────────┘  │
└──────────┼───────────────────────────────────────────┼───────────────┘
           │ 1. unsigned upload + signed context         │ 3. HTTPS + RLS-scoped reads
           │                                           │
           ▼                                           │
┌──────────────────────────────────────────────────────┴───────────────┐
│  MEDIA CORE — Cloudinary                                             │
│  upload · named transforms · gen-AI · video · HLS        │
└──────────┬──────────────────────────────────────────┬───────────────┘
           │ 2. notification webhook                   │ signed delivery URLs
           ▼                                          ▼
┌────────────────────────┐   4. enqueue    ┌──────────────────────────┐
│  API (Node/Fastify)    │───────────────▶│  Redis / BullMQ          │
│  ingest, verify, RLS,  │                │  ai-enrich               │
│  pairing, reports      │                │  pair-assets             │
└──────┬─────────────────┘                │  detect-change           │
       │ 5. HTTP                          │  generate-report         │
       ▼                                  └──────────┬───────────────┘
┌────────────────────────┐                            │
│  ML Service (FastAPI)  │◀─────── 6. claim + result ───┘
│  YOLOv8 · ChangeFormer │
│  keyframes · signals   │
└──────┬─────────────────┘
       │ 7. metrics + diff
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  DATA — Supabase: Postgres + PostGIS + RLS + Realtime + Auth        │
│  orgs · projects · assets · asset_derivatives · observations ·       │
│  change_events · reports · audit_logs · model_registry               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Responsibilities

### 3.1 Capture App (Expo / React Native)

Owns the **only** place a file is born. Never talks to the API during capture.

| Responsibility | Implementation |
|----------------|----------------|
| Camera + GPS | `expo-camera`, `expo-location` with `accuracy: Location.Accuracy.BestForNavigation` |
| Read + freeze EXIF | `expo-image-manipulator` / native EXIF read; strip `ImageDescription`, `UserComment`, `Software`, `DateTimeOriginal`, `Artist`, `Copyright`; keep `Make`, `Model`, `LensModel`, `Orientation`, `ColorSpace`, `ImageWidth`, `ImageHeight` |
| Canonical hash | JSON Canonicalization Scheme (RFC 8785) over the frozen EXIF object → SHA-256 → `exif_hash` |
| Content hash | SHA-256 over raw file bytes → `sha256_hash` (streamed, never load whole file in JS memory) |
| Signing | Ed25519 via `react-native-quick-crypto`; **private key generated in iOS Keychain / Android Keystore, non-exportable, `biometric: false` for unattended sync** |
| Offline queue | `react-native-mmkv` — encrypted with a key held in the Keychain |
| Sync | `expo-background-fetch` + `NetInfo` listener; resumable, per-item state machine |

**Signing payload** (canonical JSON, sorted keys, UTF-8, then signed):

```json
{
  "v": 1,
  "sha256": "<hex>",
  "exif_hash": "<hex>",
  "captured_at": "2026-04-11T09:32:07.412Z",
  "gps": { "lat": 12.9716, "lon": 77.5946, "accuracy_m": 4.2, "altitude_m": 920.1, "provider": "fused" },
  "project_id": "<uuid>",
  "observation_type": "forestry",
  "phase": "baseline",
  "caption": "<optional, may be null>"
}
```

Any later edit to caption, phase, or location invalidates the signature. That is the point.

> **Implementation note:** `react-native-keychain` stores generic secrets but does not expose an Ed25519 signing API. Either use `react-native-quick-crypto` with a Keystore-wrapped key, or a dedicated module. Do not assume keychain alone can sign. Fallback for MVP if native work is blocked: sign server-side at receipt and mark `signature_tier = 'server'`, never `'device'`.

### 3.2 Cloudinary (Media Core)

| Concern | Configuration |
|---------|---------------|
| Upload preset | Unsigned preset `verified_capture`; `type: authenticated`, `unique_filename: false`, `use_filename: false` |
| Public ID | `{org_id}/{project_id}/{sha256}` — deterministic, so a re-upload of identical bytes is idempotent |
| Signed delivery | API signs all delivery URLs. Dashboard never receives the API secret. |
| Named transforms | `report_thumb` (400×300 `c_lfill,g_auto`), `report_full` (1920 `c_limit`), `report_social` (1080×1350 `c_fill_pad,g_auto`), `report_diff` (normalize our rendered diff PNG) |
| Optimizations | `f_auto`, `q_auto:eco` on every derivative |
| Generative (derivative only) | `b_gen_fill` with a pad crop, `e_gen_remove`, `e_gen_recolor`, `e_gen_replace`, `e_gen_restore`, `e_gen_background_replace` |
| Video | Clip extraction (`so_`, `eo_`, `du_`), `sp_auto` streaming |
| Metadata | Context fields for signed claims; structured `metadata` for `sha256`, `exif`, `gps` |
| AI tagging | `categorization: google_tagging`, `detection: openimages`, `auto_tagging` at ingest |

> **There is no `e_diff` effect and no difference blend mode.** The before/after diff is computed by the ML service (ChangeFormer mask → red-overlay PNG) and uploaded as its own derivative. `report_diff` only normalizes that PNG. See `docs/architecture/CLOUDINARY_TRANSFORMATIONS.md` §3.

> **Generative transforms are asynchronous.** `b_gen_fill` and `e_gen_recolor` return **423 Locked** while generating and **420 Pending** for incoming transformations. Never `fetch()` one synchronously inside a request handler — register them as eager transformations at upload and read `secure_url` from the response. See `docs/architecture/CLOUDINARY_TRANSFORMATIONS.md` §4.

> **Constraint:** Cloudinary assets are **not** inherently immutable. `public_id` can be overwritten, and assets can be deleted. Immutability of *evidence* is enforced by our database (append-only `assets` rows, no UPDATE/DELETE grants) plus a documented retention policy and lifecycle rule. Enforce `overwrite: false` and an `invalidate: false` upload policy; do not rely on Cloudinary alone.

**Retention and cost (decided).** Evidence is retained **7 years** from `orgs.created_at`. The
Cloudinary lifecycle rule is *not* set to 7 years — a Cloudinary-side auto-delete would destroy
evidence we still owe an audit on. Deletion is performed by our reconciliation job, which
refuses to delete any asset referenced by a non-detached `audit_logs` partition, an unfinalized
`evidence_packages` row, or a `report_manifest_entries` row.

Each org has a **50 GB** quota (`orgs.quota_bytes`). The reconciliation job recomputes
`orgs.bytes_used` nightly. At **80%** the dashboard warns; at **100%** new uploads are rejected
with 507 and the API returns a `storage_limit_reached` error. Nothing is silently deleted to
stay under a cap — over-quota is a visible, actionable state.

#### 3.2.1 Cloudinary Is Not the Database

**Supabase/Postgres is the system of record.** Cloudinary stores bytes and applies transformations. Nothing else.

| Concern | Owner | Not Cloudinary because |
|---|---|---|
| Asset row, org, project, phase | Postgres `assets` | RLS org isolation lives in Postgres only |
| GPS, EXIF, hashes, signatures | Postgres | Must be queryable and enforceable transactionally |
| Search, facets, map queries | Postgres + PostGIS | `organization_id` filters and RLS do not exist in Cloudinary search |
| Tags from `google_tagging` | Copied **into** Postgres `observations` at ingest | Cloudinary tags are write-only to us; we never query them back |
| Change metrics, model versions | Postgres `change_events` | Versioned, auditable, relational |
| Org users, auth | Supabase Auth | — |
| Audit hash chain | Postgres `audit_logs` | Needs transactions and immutability triggers |

**Never use the Cloudinary Search API, `resources_by_*`, or `api.list()` to serve a product read.**
Those endpoints have no notion of `org_id`, so returning them to a dashboard would leak every
org's assets to anyone who can reach the API. This is the single easiest way to destroy the
platform's central claim.

Two places legitimately touch the Cloudinary Admin API, and neither serves a user request:

| Use | Direction | Purpose |
|---|---|---|
| Nightly reconciliation | Cloudinary → us | One-way integrity check: find orphaned or missing assets |
| Signing delivery URLs | us → Cloudinary | Produce a short-TTL signed URL for an asset we already selected via Postgres |

**What Cloudinary actually does for us:** stores the bytes, and applies transformations on
demand — resize/crop/format/quality, generative edits on report copies, video clip extraction,
and streaming. That is the value. Everything queryable lives in Postgres.

#### 3.2.2 Delivery and Access

Originals are uploaded as `type: authenticated`; derivatives are `type: upload`.

| Kind | Cloudinary type | Access | Rationale |
|---|---|---|---|
| Originals | `authenticated` | SDK-signed URL; no expiry on the Free plan | RLS gates URL issuance; treat the signed URL as a bearer link |
| Derivatives | `upload` | Signed URL | CDN-cacheable and fast; report copies are not sensitive |

Only the **API** can mint either. The dashboard never receives a secret, and never receives a
`public_id` from a client — it asks for a URL by `asset_id` and the API resolves it under RLS.
Without that inversion, a caller who learned another org's `sha256` could simply request its URL.

URL signing alone grants **no expiry** — the `v{...}` path segment is a cache-busting counter,
not a deadline. Real expiry comes from the auth token on originals. Any code that claims to
expire a signed `type: upload` URL is mistaken; do not build on that assumption.

#### 3.2.3 Generative Transforms Are a Job, Not a Call

`b_gen_fill`, `e_gen_recolor`, `e_gen_remove` and friends can return **423 Locked** or
**420 Pending**. They cannot complete inside a synchronous request.

- Register them as **eager transformations at upload time**, and read `secure_url` from the
  upload response.
- Or run them as a BullMQ job that polls and writes an `asset_derivatives` row on success and a
  `change_events`-style failure row on timeout.
- Never `fetch()` a generative URL synchronously in a request handler. It will hang, and it
  will burn a gen-AI credit per attempt.

Gen-AI transforms are billed per call and run on a separate (premium) allowance. Social report
variants are therefore a separate long-running job, not part of `POST /v1/reports/generate`.

### 3.3 API (Node 20 / Fastify / TypeScript)

Stateless, horizontally scalable. Owns all writes to Postgres.

| Concern | Detail |
|---------|--------|
| Ingest | `POST /webhooks/cloudinary` — verifies signature, hash, EXIF hash, then inserts asset row and enqueues enrichment |
| Verification | Ed25519 verify, SHA-256 re-verify, JCS EXIF re-canonicalization |
| Pairing | GPS clustering per observation type, then temporal ordering into before/after pairs |
| Orchestration | BullMQ producers + workers; no long-lived request work |
| Reports | Puppeteer + Handlebars, then upload PDF/HTML to Cloudinary |
| Auth | Supabase JWT; org id read from claims, never from request body |
| RLS | Every query scoped by `org_id`; service-role key used only in workers, never from a client |

### 3.4 ML Service (Python 3.11 / FastAPI)

Stateless inference. Owns nothing persistent except cached model weights.

| Concern | Detail |
|---------|--------|
| Model registry | `model_registry` table: `key`, `version`, `weights_uri`, `sector`, `status` (`trained` / `prebuilt` / `unsupported`), `metrics` |
| Routing | Resolve `observation_type.model` → registry row → cached weight loader |
| Quantification | YOLOv8 detector → object counts + masks; ChangeFormer → pixel-level change mask |
| Video | **In scope for Phase 6.** FFmpeg keyframe extraction → ORB + homography alignment → per-pair change → aggregate |
| Signals | Sector-specific extras (vegetation index, water extent, smoke) |
| Degradation | If `status != 'trained'`, return `{ "status": "unsupported", "reason": ... }`. **Never substitute another sector's model.** |
| Weight caching | Weights load **once per `(key, version)`** and are cached on the model object. Never instantiate a detector inside a request handler — a 200 MB YOLOv8 load per request is an OOM, not a latency problem. |

> **Security:** the service has no public endpoint and no arbitrary-URL fetch. The API mints a
> short-TTL **internal JWT** (120s, claims `sub`, `org_id`, `job_id`) and the ML service verifies
> it. A shared secret is rejected: it grants full ML access on leak and leaves no per-call
> audit trail. Weights load from a private bucket. Asset URLs are Cloudinary-signed with a
> genuine `exp`, so a URL cannot outlive the job that requested it.

### 3.5 Dashboard (React 19 / Vite)

Read-heavy. All writes go through the API. No secret material in the bundle.

**Scaffold with the official Cloudinary starter kit** — `create-cloudinary-react` (v1.0.0, stable).
It generates React 19 + Vite + TypeScript, matching this architecture, and ships correct
`@cloudinary/url-gen` setup. Do not use `create-cloudinary-next` (1.0.0-beta.4, and Next.js
would conflict with the documented Vite stack).

```bash
npx create-cloudinary-react@latest apps/dashboard
```

**Dependencies**

| Package | Version | Purpose |
|---------|---------|---------|
| `@cloudinary/react` | ^1.14.3 | `CldImage`, `CldVideo`, `CldUploadWidget` |
| `@cloudinary/url-gen` | ^1.22.0 | Build transformation URLs as typed objects |
| `react` / `react-dom` | ^19.2.0 | from the kit |
| `@tanstack/react-query` | — | **not in the kit** — add it; all server state |
| `maplibre-gl` | — | **not in the kit** — add it; the map |
| Node `^20.19.0 \|\| >=22.12.0` | — | required by the kit's Vite 6 |

**Env — client-exposed values only**

```
VITE_CLOUDINARY_CLOUD_NAME=          # identifier, safe to expose
VITE_CLOUDINARY_UPLOAD_PRESET=       # unsigned preset name, safe to expose
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=              # publishable, RLS-scoped
VITE_API_URL=
```

`CLOUDINARY_API_SECRET` is **never** a `VITE_` variable. Signing happens in the API. The kit's
own env templates already respect this — keep it that way.

**Cloudinary MCP servers** — the kit ships `.cursor/mcp.json` with two servers that let an AI
agent read real account state instead of guessing:

| Server | Use |
|--------|-----|
| `cloudinary-env-config` | Discover actual cloud config, presets, transformations |
| `cloudinary-asset-mgmt` | List and inspect real assets |

Requires interactive OAuth on connect. Use it to verify that every transformation in
`docs/architecture/CLOUDINARY_TRANSFORMATIONS.md` behaves as documented against the live account.

| View | Purpose |
|------|---------|
| Project picker | Hierarchical (sub-projects) + observation-type badges |
| Search + map | Faceted search with PostGIS viewport queries |
| Asset detail | Media, EXIF, GPS, integrity panel, derivative lineage |
| Change review | Side-by-side with diff overlay, metrics table, confidence |
| Reports | Template picker, generation status, PDF/HTML/social outputs |
| Integrity viewer | Audit hash chain, signature status, timestamp comparison |

---

## 4. Core Data Flows

### 4.1 Photo Capture → Dashboard (target: < 10s)

```
Capture App                    Cloudinary              API                 DB
     │                             │                    │                  │
 1.  ├─ capture frame + GPS       │                    │                  │
 2.  ├─ freeze EXIF → exif_hash   │                    │                  │
 3.  ├─ SHA-256 bytes             │                    │                  │
 4.  ├─ Ed25519 sign payload      │                    │                  │
 5.  ├─ persist to MMKV queue     │                    │                  │
 6.  ├─ POST upload (unsigned) ───▶│                    │                  │
 7.  │  context = signed claims   │                    │                  │
 8.  │◀── 200 {public_id, ts}     │                    │                  │
 9.  │  mark local item 'sent'    │                    │                  │
10.  │                             ├── webhook ───────▶│                  │
11.  │                             │                    ├─ verify sig      │
12.  │                             │                    ├─ re-hash bytes   │
13.  │                             │                    ├─ JCS exif_hash   │
14.  │                             │                    ├─ INSERT asset ───▶│
15.  │                             │                    ├─ enqueue ai-enrich
16.  │                             │                    │                  │
     │                             │                    │◀─ Realtime ──────┤
17.  │◀══════════════════════════════════════════════════════════════════│
     │                                                          Dashboard renders
```

**Failure handling**

| Failure | Behavior |
|---------|----------|
| Offline | Step 6 retries on reconnect; item stays `queued` locally |
| Upload 5xx | Exponential backoff, 5 attempts, then `failed` with reason |
| Signature invalid | Asset row inserted with `verification = 'failed'`; **quarantined**, never appears in reports |
| EXIF hash mismatch | Same quarantine; logs raw vs expected for forensics |
| Webhook lost | Cloudinary notification retry (enable `NotificationURL` retry) + nightly reconciliation job comparing Cloudinary asset list against `assets` |
| Asset exists (same sha256) | Idempotent upsert; no duplicate row, no duplicate `ai-enrich` job |

### 4.2 Pairing (before/after)

```
1. Fetch verified assets for (project_id, observation_type)   ← filter FIRST
2. Cluster by haversine distance ≤ observation_type.gps_radius
3. Within cluster, sort by device_capture_timestamp
4. Split by phase: baseline → comparison → follow_up
5. Pair consecutive baseline/comparison assets
6. Enqueue detect-change per pair
```

Filtering by observation type before GPS clustering is mandatory — a 10m water radius and a 3m infrastructure radius cannot share a clustering pass.

### 4.3 Report Generation

```
1. Validate requested asset_ids + change_event_ids all verify
2. Reject if any asset verification != 'passed'
3. Render Handlebars template → Puppeteer PDF
4. Upload PDF to Cloudinary under reports/{org}/{project}/{id}
5. On report copies only, apply gen-AI (recolor, expand, translate, caption)
6. Insert report row + audit_logs entry (hash chain)
7. Emit Realtime; dashboard shows download links
```

---

## 5. State Machines

### 5.1 Asset lifecycle

```
captured (local)
   └─▶ uploading ──▶ uploaded ──▶ verifying ──┬─▶ verified ──▶ enriching ──▶ ready
                            │                   │
                            └─▶ upload_failed   └─▶ quarantined (signature/hash/EXIF failure)
                                                        │
                                                        └─▶ reviewed ──▶ ready | rejected
```

Only `ready` assets are selectable for pairing and reports.

### 5.2 Change detection job

```
queued ──▶ claimed ──▶ downloading ──▶ aligning ──▶ detecting ──▶ diff_upload ──▶ persisted
            │            │              │             │              │
            └────────────┴──────────────┴─────────────┴──────────────┴──▶ failed (reason recorded)
```

`failed` writes a `change_events` row with `status = 'failed'` and null metrics — never a silent drop.

### 5.3 Sync (client)

```
local_queued ──▶ uploading ──▶ awaiting_verification ──▶ confirmed
      │              │                │
      └─ retry ◀─────┴────────────────┘
                              └─▶ rejected (reason shown to user, item retained)
```

---

## 6. Security Architecture

| Layer | Control |
|-------|---------|
| Transport | TLS 1.3 everywhere; HSTS |
| Client secrets | **None.** Capture app uses an unsigned preset; dashboard uses the Supabase anon key only |
| Upload abuse | Unsigned presets are discoverable by name. Mitigate with per-org rate limits, `max_file_size`, allowed `context` allowlist, and a Cloudinary `incoming_webhook` signature check. Do not treat "unsigned preset" as "app-only". |
| Secrets | Platform env vars (Railway/Fly/Vercel), Supabase Vault for Edge Functions, 1Password for local. `CLOUDINARY_API_SECRET` and service-role keys never reach client bundles or git. |
| Row isolation | RLS on every table: `org_id = auth.jwt() ->> 'org_id'`. The `org_id` and `role` claims are written into the user's Supabase `app_metadata` by `platform_admin` at invite redemption, via `auth.admin.updateUserById()`. `app_metadata` is server-controlled and not writable by the user, so the claim cannot be tampered with. No Custom Access Token Hook and no `org_members` join table are required while each user belongs to exactly one org. |
| Column immutability | RLS is **row-level only**. Evidence columns (`sha256_hash`, `exif_hash`, `capture_signature`, `device_capture_timestamp`) are protected by: `REVOKE UPDATE` on those columns from client roles, plus a `BEFORE UPDATE` trigger that raises on any change. Restricted `service_role` writes go through a `SECURITY DEFINER` function. |
| Secrets rotation | Cloudinary API secret + Supabase service key + Redis password monthly; JWT keys quarterly; full revoke-and-redeploy within 1h on incident |
| Service auth | API → ML uses a 120s internal JWT (`sub`, `org_id`, `job_id`). No shared secret. ML rejects a request with no valid claim. |
| SSRF | ML service accepts only Cloudinary URLs carrying a genuine `exp`; no arbitrary-URL fetch endpoint. Expiry is real because originals are `type: authenticated`. |
| URL minting | `public_id` is never accepted from a client. The API resolves it by `asset_id` under RLS, so another org's hash cannot be requested. |
| Webhooks | Verify Cloudinary notification signature and compare against the stored `public_id` before trusting any context field |

### 6.1 Secret Inventory

Complete list. Anything not on this table does not belong in the project.

| Variable | Consumed by | Rotation | Secret? |
|----------|-------------|----------|---------|
| `CLOUDINARY_CLOUD_NAME` | API, ML, workers | never (identifier) | no |
| `CLOUDINARY_API_KEY` | API, ML, workers | quarterly | **yes** |
| `CLOUDINARY_API_SECRET` | API, ML, workers | monthly | **yes** |
| `CLOUDINARY_UPLOAD_PRESET` | Capture app | never (config) | no |
| `SUPABASE_URL` | all services | never (identifier) | no |
| `SUPABASE_ANON_KEY` | Dashboard, capture app | quarterly | **yes** (publishable, RLS-scoped) |
| `SUPABASE_SERVICE_KEY` | API workers, ML | monthly | **yes** |
| `SUPABASE_JWT_SECRET` | API (token verification) | quarterly | **yes** |
| `ML_SERVICE_URL` | API | on ML deploy | no |
| `REDIS_URL` | API (BullMQ) | quarterly | **yes** |
| `WEBHOOK_SECRET` | API → outbound webhooks | quarterly | **yes** |
| `SENTRY_DSN` | API, ML, dashboard | on rotate | **yes** |

**Where they live**

| Environment | Mechanism |
|-------------|-----------|
| Local | `.env.local`, gitignored. Source of truth in 1Password. |
| CI | GitHub Actions Secrets. Never in workflow YAML literals. |
| Production | Platform env vars: Railway/Fly.io (API, ML, worker), Vercel (dashboard). |
| Supabase Edge Functions | Supabase Vault, not build-time env. |

**Rotation procedure**

1. Regenerate in the provider console.
2. Update the platform env var.
3. Redeploy the affected service.
4. Confirm the old value fails: `CLOUDINARY_API_SECRET` and `SUPABASE_SERVICE_KEY` monthly; `SUPABASE_JWT_SECRET` quarterly (rotating it logs everyone out — plan a maintenance window); on any suspected compromise, revoke and redeploy within 1 hour.

> **Note on `EXPO_PUBLIC_*`:** the `EXPO_PUBLIC_` prefix means **inlined into the JS bundle**. It is not a secret store. Only `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME`, `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET`, and `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` may use it. `CLOUDINARY_API_SECRET` and `SUPABASE_SERVICE_KEY` must never carry that prefix.

**Pre-commit check**

```bash
git grep -nE "cloudinary_api_secret|CLOUDINARY_API_SECRET=|service_role|SUPABASE_SERVICE|EXPO_PUBLIC.*SECRET"
# must return nothing
```

---

## 7. Integrity Model (corrected)

### 7.1 EXIF canonicalization

The client and server **must** produce byte-identical canonical bytes.

- Serialize the frozen EXIF object with **RFC 8785 (JCS)**: keys sorted by UTF-16 code unit, no insignificant whitespace, ECMAScript-compatible number formatting.
- `exif_hash = SHA256(JCS(exif))`.
- Do **not** rely on `jsonb_strip_nulls(exif)::text` in Postgres — Postgres text output differs from JavaScript `JSON.stringify` in whitespace, escaping, and number formatting, and will produce false mismatches.

### 7.2 Clock skew vs offline dwell

These are different phenomena and **cannot** be separated with a naive timestamp subtraction.

```
server_received_at - device_capture_timestamp = offline_dwell + clock_skew + network_latency
```

No combination of Cloudinary's `created_at` and the API's receipt time removes `offline_dwell`. Therefore:

| Field | Meaning |
|-------|---------|
| `device_capture_timestamp` | Device wall clock at capture (untrusted for ordering) |
| `device_monotonic_ms` | Monotonic counter since app launch, included in the signed payload |
| `server_received_at` | API receipt (trusted) |
| `cloudinary_created_at` | Upload time at media core (trusted) |
| `upload_started_at` | Client time just before upload began (untrusted, bounds dwell) |
| `sync_delay_seconds` | `server_received_at - upload_started_at` → **dwell is now isolated** |
| `clock_skew_estimate` | Optional: NTP offset sampled at capture, signed. Absent → report as `unknown`, never as a pass |

Integrity check output is a three-state result per check: `pass` / `fail` / `unknown`. Only `fail` blocks a report.

---

## 8. Deployment Topology

| Service | Platform | Scale trigger | Notes |
|---------|----------|---------------|-------|
| Dashboard | Vercel | Edge CDN | Static build; env vars injected at build |
| API | Railway or Render | Replicas on p95 latency | Needs sticky-free LB (stateless) |
| ML Service | Fly.io | GPU autostop on idle | Model weights on boot; cold start ~20s |
| Worker | Same image as API, different command | Queue depth | Scales independently from HTTP |
| Database | Supabase | Managed | PITR enabled; read replica when needed |
| Media | Cloudinary | Managed | Startup Kit credits are unverified — confirm the current program before relying on them in a budget. |
| Queue | Redis (Upstash or Railway) | Managed | Persistence on; AOF |

### Environments

`local` (Supabase CLI + MinIO-free, direct Cloudinary dev preset) → `staging` → `production`. Each has its own Cloudinary cloud, Supabase project, and Redis DB index.

---

## 9. Observability

| Signal | Source | Alert condition |
|--------|--------|-----------------|
| Structured logs | Pino (API), structlog (ML), correlated by `request_id` | error rate > 2% over 5m |
| Traces | OpenTelemetry, W3C context propagated API → ML | p95 `/detect-change` > 5s |
| Metrics | Prometheus scrape or hosted; RED + queue depth | `ai-enrich` queue depth > 500 |
| Errors | Sentry (API, ML, Dashboard) | new error type appears |
| Integrity alerts | Nightly reconciliation job | any `quarantined` asset, any hash mismatch |
| Cost | Cloudinary usage API | daily spend > 1.5× 7-day average |

---

## 10. Known Constraints and Accepted Risks

| # | Constraint | Mitigation / status |
|---|-----------|---------------------|
| 1 | Only the forestry model is actually trainable in 6 weeks | Other sectors return `unsupported`; UI shows "not yet available" |
| 2 | Client-side Ed25519 in a Secure Enclave needs native work | MVP fallback is `signature_tier = 'server'`; never mislabel it as device-signed |
| 3 | Unsigned upload presets are name-discoverable | Rate limits, allowlists, webhook signature verification |
| 4 | Cloudinary assets can be overwritten or deleted | Our DB is the system of record; retention policy + overwrite/invalidate disabled |
| 5 | Report PDFs are snapshots, not live documents | Store the template + input IDs so a report can be regenerated deterministically |
| 6 | Gen-AI credits are finite and metered | Per-org monthly budget cap; block at 80% with an admin warning |
| 7 | PostGIS clustering is O(n²) naively | Grid-bucket by `gps_radius` before clustering; migrate to `ST_ClusterKMeans` past ~50k assets |
| 8 | No LLM available offline | Report summaries degrade to a deterministic template; no numeric content is lost |

---

## 11. Architecture Decision Log

| ID | Decision | Rationale | Rejected alternative |
|----|----------|-----------|---------------------|
| ADL-01 | Direct client → Cloudinary upload | App works with no API availability; removes a bandwidth hop | Proxying media through the API |
| ADL-02 | Integrity in Cloudinary `context` + `metadata` | Survives alongside the asset; survives a DB restore | Metadata only in Postgres |
| ADL-03 | Supabase over self-managed Postgres | Managed PITR, Auth, RLS, Realtime at hackathon scale | Self-hosting Postgres |
| ADL-04 | Custom CV over LLM for metrics | Auditable, reproducible, offline-capable, cheaper at volume | LLM/VLM scoring |
| ADL-05 | BullMQ + Redis over managed workflow engines | Same language as the API, no vendor lock, trivial local dev | Temporal / AWS Step Functions |
| ADL-06 | Puppeteer + Handlebars over a report SaaS | Full control over the integrity appendix; no per-report vendor fee | Third-party PDF API |
| ADL-07 | `observation_types[].model` over a single `sector` field | A project can mix sectors in one deployment | One model per project |
| ADL-08 | Filter by observation type before GPS clustering | Radii and models differ per type; mixing corrupts pairs | Cluster globally, filter after |
| ADL-09 | Explicit `unsupported` over model fallback | A wrong-sector number in a donor report is a credibility failure | Default to forestry |
| ADL-10 | RFC 8785 canonical JSON over `jsonb::text` | The two serializers cannot be made to agree by convention | Postgres-side canonicalization |

---

*End of System Architecture*
