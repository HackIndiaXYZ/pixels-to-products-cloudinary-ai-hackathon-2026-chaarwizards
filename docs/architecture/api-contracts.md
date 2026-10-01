# API Contracts (OpenAPI 3.0)

> **Panchnama** — a written record of inspection, signed by a witness.

---

## Overview

All APIs use JSON request/response bodies. Authentication via Supabase JWT (Bearer token). Org-scoped access enforced by RLS.

**Base URLs:**
- Node API: `https://api.impact-platform.example.com/v1`
- ML Service: `https://ml.impact-platform.example.com/v1`
- Dashboard: `https://app.impact-platform.example.com`

---

## 1. Capture App → Cloudinary (Direct Upload)

### Upload Image/Video
```
POST https://api.cloudinary.com/v1_1/{cloud_name}/image/upload
Content-Type: multipart/form-data

FormData Fields:
- file: binary (required)
- upload_preset: "verified_capture" (required)
- public_id: "{org_id}/{project_id}/{sha256}" (required)
- context: JSON string (required)
- metadata: JSON string (required)

context JSON:
{
  "capture_signature": "base64_ed25519_signature",
  "device_id": "device-uuid",
  "device_public_key": "base64_ed25519_public_key",
  "capture_timestamp": "2024-01-15T09:30:00.000Z",
  "capture_commit_hash": "sha256_hex",
  "gps_lat": 19.1234,
  "gps_lon": 72.8765,
  "gps_accuracy": 3.2,
  "gps_altitude": 10.5,
  "gps_provider": "fused",
  "gps_timestamp": "2024-01-15T09:30:00.000Z",
  "project_id": "project-uuid",
  "org_id": "org-uuid",
  "observation_type": "planting",
  "phase": "before",
  "app_version": "1.0.0",
  "caption": "Planted 50 saplings",
  "caption_signature": "base64_ed25519_signature",
  "caption_language": "en",
  "caption_created_at": "2024-01-15T09:30:00.000Z",
  "exif_hash": "sha256_hex"
}

metadata JSON:
{
  "sha256": "sha256_hex",
  "exif": {
    "Make": "Apple",
    "Model": "iPhone 15 Pro",
    "Orientation": 1,
    "DateTimeOriginal": "2024:01:15 09:30:00",
    ...
  }
}

Response (200):
{
  "public_id": "org-uuid/project-uuid/sha256_hex",
  "asset_id": "cloudinary-asset-id",
  "created_at": "2024-01-15T09:30:05.123Z",
  "secure_url": "https://res.cloudinary.com/...",
  ...
}
```

---

## 2. Cloudinary Webhook → Node API

### Upload Notification
```
POST /webhooks/cloudinary
Content-Type: application/json
X-Cloudinary-Signature: sha256=... (for verification)

Body:
{
  "event": "upload",
  "info": {
    "public_id": "org-uuid/project-uuid/sha256_hex",
    "asset_id": "cloudinary-asset-id",
    "resource_type": "image",
    "context": { ... },  // Same as upload context
    "metadata": { "sha256": "...", "exif": {...} },
    "created_at": "2024-01-15T09:30:05.123Z",
    "bytes": 2048576,
    "format": "jpg",
    "width": 4032,
    "height": 3024
  }
}

Response: 200 OK (async processing)
```

**AI tags at ingest (Phase 5).** The `verified_capture` preset runs
`categorization: google_tagging` + `detection: openimages`, so the notification
may carry `info.tags` and `info.info.categorization` / `info.info.detection`.
On a fresh, non-quarantined asset the API copies these into Postgres
`observations` (`notes = 'cloudinary_ai_tags'`) and never queries Cloudinary
back for them (AGENTS.md §3.9). Tags on a quarantined asset are discarded.

---

## 3. Node API → Python ML Service

**Auth: internal JWT minted by the API.** The API signs a short-TTL token carrying `org_id`,
`job_id` and `sub`; the ML service verifies it and never accepts a bare shared secret. This
gives a per-call audit trail and lets the ML service reject cross-org work.

```
POST /v1/detect-change
Content-Type: application/json
Authorization: Bearer <internal-jwt>   # HS256, 120s TTL, claims: sub, org_id, job_id

Request:
{
  "before_url": "https://res.cloudinary.com/.../before.jpg",
  "after_url": "https://res.cloudinary.com/.../after.jpg",
  "sector": "forestry",
  "project_id": "project-uuid",
  "gps_before": {"lat": 19.1234, "lon": 72.8765},
  "gps_after": {"lat": 19.1235, "lon": 72.8766},
  "accuracy_before": 3.2,
  "accuracy_after": 2.8
}

Response (200):
{
  "change_type": "sapling_planting",
  "change_metrics": {
    "saplings_planted": 49,
    "area_covered_sqm": 1200.5,
    "planting_density_per_sqm": 0.0408,
    "before_count": 2,
    "after_count": 51,
    "alignment_quality": 0.95
  },
  "model_version": "v1-placeholder",
  "confidence": 0.93,
  "diff_url": "https://res.cloudinary.com/.../diff.jpg"
}

# `model_version` is the model_registry version that produced every number and
# is what change_events.model_version records (AGENTS.md §3.2). A sector with no
# trained model returns 200 with the envelope below instead of metrics — never a
# borrowed number from another sector (§3.3):
#   { "status": "unsupported" }
```

### Detect Change (video)
```
POST /v1/detect-change-video
Content-Type: application/json
Authorization: Bearer <internal-jwt>

Request:
{
  "video_url": "https://res.cloudinary.com/.../clip.mp4",
  "sector": "forestry",
  "project_id": "project-uuid",
  "gps": {"lat": 19.1234, "lon": 72.8765}
}

Response (200):
{
  "change_type": "sapling_planting",
  "change_metrics": { "...": "aggregate (first vs last keyframe)" },
  "keyframes": [
    { "index": 1, "alignment_quality": 0.9, "change_metrics": { "...": "..." } }
  ],
  "model_version": "v1-placeholder",
  "confidence": 0.9
}
# ffmpeg keyframe extraction → ORB + homography alignment → per-keyframe change
# + aggregate. Unsupported sectors return { "status": "unsupported" }.
```

### Health & Model Info
```
GET /health                         -> { "status": "ok", "version": "0.6.0" }

GET /model-info?key=forestry        # requires the internal JWT
  -> { "key": "forestry", "version": "v1-placeholder",
       "sector": "forestry", "status": "trained" }
  # a non-trained key returns { "status": "unsupported" }
```


### Classify Activity
```
POST /v1/classify-activity
Content-Type: application/json
Authorization: Bearer <internal-jwt>

Request:
{
  "asset_url": "https://res.cloudinary.com/.../asset.jpg",
  "sector": "forestry"
}

Response (200):
{
  "activity_type": "planting",
  "phase": "after",
  "confidence": 0.85,
  "indicators": {
    "saplings_visible": 45,
    "people_visible": 3,
    "tools_visible": 2
  },
  "model_version": "v1-placeholder"
}
# Unsupported sectors return { "status": "unsupported" }.
```

### Extract Visual Signals
```
POST /v1/extract-signals
Content-Type: application/json
Authorization: Bearer <internal-jwt>

Request:
{
  "asset_url": "https://res.cloudinary.com/.../asset.jpg",
  "sector": "forestry"
}

Response (200):
{
  "vegetation_index": 0.42,
  "water_present": false,
  "smoke": false,
  "machinery": [],
  "bare_ground_pct": 0.15,
  "canopy_cover_pct": 0.68,
  "model_version": "v1-placeholder"
}
# Unsupported sectors return { "status": "unsupported" }.
```

---

## 4. Dashboard → Node API (REST)

### Authentication
```
Authorization: Bearer <supabase-jwt>
```

### Projects

#### List Projects
```
GET /v1/projects?limit=20&cursor=eyJvIjoxMDB9

Response (200):
{
  "data": [
    {
      "id": "project-uuid",
      "org_id": "org-uuid",
      "name": "Mangrove Phase 2",
      "sector": "forestry",
      "geometry": {"type": "Polygon", "coordinates": [...]},
      "start_date": "2024-01-01",
      "end_date": "2024-12-31",
      "config": {...},
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

#### Get Project
```
GET /v1/projects/{project_id}
Response (200): Project object
```

#### Create Project
```
POST /v1/projects
Body: {name, sector, geometry?, start_date, end_date, config?}
Response (201): Project object
```

### Assets

#### List Assets (with filters)
```
GET /v1/projects/{project_id}/assets?
  bbox=minLon,minLat,maxLon,maxLat&
  date_from=2024-01-01&
  date_to=2024-01-31&
  tags=tree,planting&
  observation_type=planting&
  phase=before&
  gps_accuracy_max=10&
  limit=20&cursor=eyJvIjoxMDB9

Response (200):
{
  "data": [
    {
      "id": "asset-uuid",
      "project_id": "project-uuid",
      "cloudinary_public_id": "org-uuid/project-uuid/sha256_hex",
      "asset_type": "image",
      "device_capture_timestamp": "2024-01-15T09:30:00Z",
      "gps_point": {"type": "Point", "coordinates": [72.8765, 19.1234]},
      "gps_accuracy_meters": 3.2,
      "gps_provider": "fused",
      "caption": "Planted 50 saplings",
      "caption_signature": "base64...",
      "ai_tags": ["tree", "planting", "soil"],
      "observation_type": "planting",
      "phase": "before",
      "server_upload_timestamp": "2024-01-15T09:30:05Z",
      "upload_status": "verified"
    }
  ],
  "total": 100
}
```

#### Get Asset with Integrity
```
GET /v1/assets/{asset_id}/integrity
Response (200):
{
  "asset_id": "asset-uuid",
  "device_capture_timestamp": "2024-01-15T09:30:00Z",
  "server_upload_timestamp": "2024-01-15T09:30:05Z",
  "server_received_at": "2024-01-15T09:30:05.123Z",
  "clock_drift_seconds": 5,
  "gps_accuracy_meters": 3.2,
  "gps_provider": "fused",
  "device_signature_verified": true,
  "exif_hash_verified": true,
  "caption_signature_verified": true,
  "audit_chain_intact": true,
  "sha256_matches_commit": true
}
```

#### Verify Asset Audit Chain (Phase 10)

Structured verification of an asset's append-only audit hash chain (§3.8). The
server recomputes every row's content hash in Postgres (byte-identical to
`append_audit_log`, so the microsecond `hashed_at` reproduces) and checks link
continuity, then re-canonicalizes each row's raw `details` (RFC 8785) to catch a
`details` tamper the hash-over-`details_canonical` would miss. The verdict NAMES
the first tampered row (`hash_mismatch` / `details_tampered`) or gap
(`broken_link`) — it never returns a bare "invalid". Resolved by `asset_id` under
RLS; a cross-org id is a `404`. `from`/`to` are optional inclusive
`audit_logs.id` bounds.

```
GET /v1/assets/{asset_id}/verify-chain?from=&to=
Response (200):
{
  "asset_id": "asset-uuid",
  "ok": false,
  "checked": 2,
  "first_id": 101,
  "last_id": 104,
  "tip_hash": "9f2c...",
  "failure": {
    "audit_id": 103,
    "kind": "hash_mismatch",         // or "broken_link" | "details_tampered"
    "reason": "row 103 content does not reproduce its stored current_hash (a stored value was tampered)"
  }
}
```

> **Status:** implemented in Phase 10 (`routes/verification.ts` →
> `services/chain-verifier.ts` + SQL `verify_audit_chain_range`). Backs the
> dashboard integrity viewer's chain visualization and its exportable
> verification record.

#### Get Asset Derivative Lineage

The append-only `asset_derivatives` lineage for an asset (§3.1), read by the
dashboard's asset-detail lineage tree (Phase 8). Every row carries the exact
`transformation` string and `is_generative`, so a reviewer sees which bytes are
the pristine original and which are derived. Resolved by `asset_id` under RLS —
a cross-org id returns `404`.

```
GET /v1/assets/{asset_id}/derivatives
Response (200):
{
  "data": [
    {
      "id": "derivative-uuid",
      "parent_asset_id": "asset-uuid",
      "org_id": "org-uuid",
      "transformation": "c_lfill,g_auto,w_400,h_300,f_auto,q_auto:eco",
      "kind": "report_thumb",
      "public_id": "org/proj/report_thumb/sha256",
      "is_generative": false,
      "created_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

> **Status:** implemented in Phase 8 as a read-only handler
> (`GET /v1/assets/:id/derivatives`, `routes/reads.ts`): the parent asset is
> resolved under RLS (a cross-org id is a `404`), then its `asset_derivatives`
> rows are returned oldest-first. The dashboard lineage tree consumes it live.


### Change Events

#### List Change Events
```
GET /v1/projects/{project_id}/change-events
Response (200):
{
  "data": [
    {
      "id": "change-uuid",
      "project_id": "project-uuid",
      "before_asset_id": "asset-uuid-1",
      "after_asset_id": "asset-uuid-2",
      "change_type": "sapling_planting",
      "change_metrics": {...},
      "confidence": 0.93,
      "diff_asset_cloudinary_id": "org-uuid/project-uuid/diff_sha256",
      "gps_distance_meters": 2.1,
      "time_difference_hours": 5.5,
      "created_at": "2024-01-15T15:00:00Z"
    }
  ]
}
```

#### Manual Pairing Override (Phase 7)

A reviewer can link two assets into a before/after pair, or split a pair the
automated worker got wrong. Both actions resolve every id under the caller's RLS
scope — a crafted id from another org returns `404`, never a silent success
(§3.4) — and both append to the audit chain. `org_id` comes from the verified
JWT, never the body. A manual link carries no CV metric: `change_metrics` is
empty and `model_version` is the `manual` sentinel (§3.2).

```
POST /v1/pairs                     # member+ ; org_admin ; platform_admin
Body:
{
  "before_asset_id": "asset-uuid-1",
  "after_asset_id":  "asset-uuid-2"   # must differ and share a project
}

Response (201): the created change_event
{
  "id": "change-uuid",
  "status": "manual",
  "detection_method": "manual",
  "model_version": "manual",
  "before_asset_id": "asset-uuid-1",
  "after_asset_id":  "asset-uuid-2",
  "change_metrics": {},
  ...
}
Errors: 400 (same asset / cross-project), 403 (viewer), 404 (asset not in org)

POST /v1/pairs/{change_event_id}/split    # member+ ; org_admin ; platform_admin
Response (200): the change_event with "status": "split"
Errors: 403 (viewer), 404 (pair not in org)
```


### Search

#### Global Search
```
GET /v1/search?
  q=planting&
  bbox=72.8,19.1,72.9,19.2&
  date_from=2024-01-01&
  date_to=2024-01-31&
  gps_accuracy_max=10&
  tags=tree,sapling&
  limit=20&cursor=eyJvIjoxMDB9

Response (200): Asset list with relevance scoring, plus
  "truncated": true,          // true when total > 1000
  "total_matched": 14203,
  "facet_counts": { "phase": { "before": 7211, "after": 6992 } },
  "next_cursor": "eyJvIjoyMH0"
```

`limit` defaults to 20 and is clamped to 100. `total_matched` and `facet_counts` are computed
over the full match set, not the returned page, so the UI can state the real number.

### Reports

> **Implemented (Phase 9).** `POST /v1/reports/generate` (`apps/api/src/routes/reports.ts`
> → `services/report-generation.ts`) and `GET /v1/report-templates` are live. Generation
> refuses if any selected asset is not `verified`, inlines a `report_full` derivative of every
> photo as a base64 data URI (self-contained, offline), writes one `report_manifest_entries`
> row per inlined element with the SHA-256 of the embedded bytes, and pins `template_version`.
> Metrics are serialized with Decimal.js for byte-identical regeneration. Gen-AI social variants
> are a **separate** BullMQ job (`report-genai`, `services/report-genai.ts`) applied only to
> report copies — the generate call returns the report + manifest and does not block on them.

#### Generate Report
```
POST /v1/reports/generate
Body:
{
  "project_id": "project-uuid",
  "template_id": "template-uuid",  // or "forestry_donor"
  "change_event_ids": ["change-uuid-1", "change-uuid-2"],
  "include_integrity_appendix": true
}

Response (200):
{
  "report_id": "report-uuid",
  "self_contained": true,
  "pdf_url": "https://res.cloudinary.com/.../report.pdf",
  "html_url": "https://res.cloudinary.com/.../report.html",
  "byte_size": 41_200_000,
  "manifest": [
    {
      "ordinal": 1,
      "role": "photo",
      "cloudinary_public_id": "org/proj/sha256_before",
      "derivative_public_id": "org/proj/report_full_v1/sha256_before",
      "sha256_hash": "9f2c...",
      "verified": true
    },
    { "ordinal": 2, "role": "diff", "derivative_public_id": "org/proj/report_diff_v1/...", "sha256_hash": "41ab...", "verified": true }
  ],
  "blocked_reason": null,
  "generated_at": "2024-01-15T15:30:00Z",
  "template_version": "forestry_donor@3"
}
```

**`self_contained: true` is a contract, not a convenience.** All media is inlined into the
artifact at generation time. A finalized report renders identically with no network and no valid
token, which is the only way an audit artifact stays trustworthy years later. The `manifest`
is the integrity appendix: it maps every inlined element back to a `public_id` + `sha256`.

The same report also self-validates against the same inputs. Metrics are serialized with
**Decimal.js**, never float `JSON.stringify`, so `0.1 + 0.2` style drift cannot change a
document byte between runs. `template_version` is pinned; changing a template changes the hash,
deliberately, so two reports built from different template versions are never confused.

`social_assets` were removed from this response: gen-AI edits and crops are asynchronous
(420/423) and cannot be produced inside a synchronous generate call. Social variants are a
separate long-running job; see `ARCHITECTURE.md` §3.2.3.

#### List Templates
```
GET /v1/report-templates?sector=forestry
Response (200): Template list
```

#### Verify Report (public-safe receipt, Phase 10)

A public-safe verification receipt for a report id. Given a report id it returns
ONLY hashes, counts, timestamps, and per-asset chain verdicts (each from
`verify_audit_chain_range`). It carries no `org_id`, user identity, GPS
coordinate, caption, or Cloudinary `public_id` (public_ids embed the org_id), so
it is safe to export and share as standalone evidence. Access is still gated by
RLS (`SECURITY INVOKER`): a cross-org report id is a `404`. Running it again over
the same rows yields the same verdicts and tip hashes, so the receipt is a
re-verification against Postgres, not a decorative snapshot.

```
GET /v1/reports/{report_id}/verification
Response (200):
{
  "report_id": "report-uuid",
  "status": "finalized",
  "template_version": "forestry_donor@1",
  "generated_at": "2024-01-15T15:30:00Z",
  "byte_size": 41200000,
  "chains_verified": true,
  "asset_chains": [
    { "index": 0, "chain_verified": true, "chain_length": 4, "tip_hash": "9f2c...", "failure": null }
  ],
  "manifest": [
    { "ordinal": 1, "role": "photo", "sha256_hash": "9f2c...", "byte_size": 1048576, "verified": true }
  ]
}
```

> **Status:** implemented in Phase 10 (`routes/verification.ts` → SQL
> `report_verification_receipt`). Backs the dashboard's exportable report
> verification record.

### Audit Trail

The per-asset audit hash chain is surfaced through the **Phase 10** structured
verifier, not a raw log-listing endpoint. `GET /v1/assets/{asset_id}/verify-chain`
(above) recomputes and verifies the chain, naming the first tampered row or gap,
and `GET /v1/reports/{report_id}/verification` returns a public-safe receipt of
the chain verdicts for every asset in a report. There is no
`GET /v1/assets/{asset_id}/audit-trail` route in the MVP: exposing raw
`audit_logs` rows (which carry `details` that may reference internal identifiers)
was intentionally dropped in favour of the verify-chain contract, which returns a
verdict rather than the underlying rows. Reconciled to match reality in Phase 11.

---

## 5. Delivery URLs

Two endpoints, because originals and derivatives use different Cloudinary access mechanisms.
See `DATABASE_SCHEMA.md` §"Delivery URL Generator" and `ARCHITECTURE.md` §3.2.2.

### Original asset (authenticated, real expiry)
```
POST /v1/assets/{asset_id}/original-url
Authorization: Bearer <supabase-jwt>
Body: { "ttl_seconds": 300 }

Response (200):
{
  "url": "https://res.cloudinary.com/.../image/authenticated/...__cld_token__=stp=..&exp=..&url=..&hmac=..",
  "expires_at": 1705345800
}
```

`public_id` is **not** accepted from the client. The API looks it up by `asset_id` under RLS,
so a caller cannot request another org's media by guessing a hash.

### Derivative (signed, CDN-cacheable)
```
POST /v1/assets/{asset_id}/derivative-url
Authorization: Bearer <supabase-jwt>
Body: { "transformation": "c_lfill,g_auto,w_400,h_300,f_auto,q_auto:eco" }

Response (200):
{
  "url": "https://res.cloudinary.com/.../image/upload/c_lfill,g_auto,.../s--<hmac-sha1>--/v1/org/proj/sha256"
}
```

`transformation` is validated against an allowlist of our named transforms plus a small set of
safe delivery parameters (`w_`, `h_`, `c_` (fill, lfill, limit, scale, pad, fill_pad), `g_auto`, `f_auto`, `q_auto`, `dpr_auto`). Arbitrary
transformation strings are rejected with 422 — a signed URL with attacker-chosen parameters is
a free resize and gen-AI billing primitive.

### Org provisioning (platform_admin only)
```
POST /v1/orgs
Authorization: Bearer <supabase-jwt>       # must carry role = platform_admin
Body: { "name": "Kenya Forestry Agency", "type": "government" }

Response (200): { "org_id": "uuid", "invite_url": "https://.../invite/<token>" }
```

There is no public signup endpoint. Orgs are provisioned by a platform admin, who then invites
the first `org_admin`. Invite tokens are single-use, expire in 72 hours, and are stored hashed.

---

## 5b. Internal Media Pipeline (Phase 5, not HTTP endpoints)

These are server-side operations, never client-facing routes.

| Operation | Where | Notes |
|---|---|---|
| Derivative writer | `services/derivatives.ts` `createDerivative(parentAssetId, transformation, kind, isGenerative)` | Applies an eager transformation, inserts an append-only `asset_derivatives` row (`parent_asset_id` + exact transformation string, §3.1), appends an audit row. Generative edits are permitted **only** on a report-copy derivative; a generative call on an original is rejected. Generative transforms are async (420/423) and reported `pending`, never fetched synchronously (§3.11). |
| Reconciliation job | `jobs/reconcile.ts` (nightly) | One-way Cloudinary→Postgres integrity check (§3.9): reports orphans (in Cloudinary, no DB row) and missing (DB row, no bytes), and recomputes `orgs.bytes_used`. The only sanctioned Admin-API listing. |
| Upload-preset setup | `jobs/setup-preset.ts` (one-time) | Provisions the unsigned `verified_capture` preset: `overwrite:false`, `invalidate:false`, `type:authenticated`, allowed formats + `max_file_size`, AI tagging, and the signed incoming webhook. |

---

## 6. Error Responses

All APIs return consistent error format:
```json
{
  "error": {
    "code": "VALIDATION_ERROR|UNAUTHORIZED|FORBIDDEN|NOT_FOUND|INTERNAL_ERROR",
    "message": "Human-readable description",
    "details": {}  // Optional field-specific errors
  }
}
```

HTTP Status Codes:
- 200: Success
- 201: Created
- 400: Bad Request (validation)
- 401: Unauthorized (invalid/expired JWT)
- 403: Forbidden (RLS/org scope)
- 404: Not Found
- 422: Unprocessable Entity (business logic)
- 429: Rate Limited
- 500: Internal Server Error

---

## 7. Rate Limits and Pagination

**Rate limits** — per user, sliding window, `429` with `Retry-After` when exceeded.

| Endpoint | Limit |
|----------|-------|
| `GET /v1/projects` | 100 req/min |
| `GET /v1/projects/{id}/assets` | 200 req/min |
| `GET /v1/search` | 50 req/min |
| `POST /v1/reports/generate` | 10 req/min |
| `GET /v1/assets/{id}/integrity` | 100 req/min |
| `GET /v1/assets/{id}/verify-chain` | 100 req/min |
| `GET /v1/reports/{id}/verification` | 100 req/min |
| `POST /v1/assets/{id}/original-url` | 300 req/min |
| `POST /v1/assets/{id}/derivative-url` | 600 req/min |
| `POST /v1/orgs` | 5 req/hour, `platform_admin` only |
| `POST /v1/pairs`, `POST /v1/pairs/{id}/split` | 60 req/min per user |
| ML `/v1/detect-change` | 20 req/min per org |
| Cloudinary webhook | 2000 req/min, burst 4000 |

**Per-org upload limit (Phase 11).** The capture app uploads directly to
Cloudinary through the **unsigned** `verified_capture` preset, so the webhook
ingest (`POST /webhooks/cloudinary`) is the first server-side surface that sees
an org's upload volume. It carries a per-org ceiling — `ORG_UPLOAD_RATE_MAX`
uploads per `ORG_UPLOAD_RATE_WINDOW_MS` (default 600/min) — keyed on the `org_id`
derived from the **signed** `project_id`, never the request body. Exceeding it
returns `429` with a `Retry-After` header and persists the reason to the log;
because each org has its own window, a flood from one tenant never denies service
to another. This is the unsigned-preset abuse mitigation.

**Pagination** — every list endpoint is paginated. Unbounded result sets are a denial-of-service
vector and the reason a "search is slow" bug usually turns out to be an unpaginated query.

| Parameter | Default | Max | Notes |
|-----------|---------|-----|-------|
| `limit` | 20 | **100** | Values above 100 are clamped, not rejected |
| `offset` | 0 | — | Use `cursor` for deep paging; offset degrades on large tables |

Every list response returns a `next_cursor` (opaque, base64 of the sort key). The dashboard
(TanStack Query `useInfiniteQuery`) pages with the cursor, never by incrementing an offset.
`GET /v1/search` additionally hard-caps at 1000 total matches and returns
`"truncated": true` plus facet counts for the true total, so the UI can say "showing 100 of
14,203" rather than silently lying.

---

## 8. Webhook Events (Node API → External)

```
POST {configured_webhook_url}
Content-Type: application/json
X-Webhook-Signature: sha256=...

Events:
- asset.uploaded
- asset.verified
- asset.flagged
- change_event.detected
- report.generated
- integrity.check_failed

Payload:
{
  "event": "asset.verified",
  "timestamp": "2024-01-15T09:30:05Z",
  "data": {...}  // Asset object
}
```