# Impact Media Intelligence Platform

AI-powered media intelligence platform that transforms raw field media (photos & videos) into **searchable evidence**, **quantified impact metrics**, and **audit-ready visual reports** for NGOs, governments, and sustainability organizations.

---

## Problem Statement

An NGO uploads 40,000 field photos from a six-month reforestation programme. Three months later a
donor asks for evidence that 800 hectares were restored.

What exists: a phone gallery. No one can find the photos of the northern plots. Nobody can prove
the "after" photos were taken on the same ground as the "before" photos, because EXIF was
stripped by a messaging app along the way. Manual inspection of 40,000 images to count saplings
would take a team weeks, and any hand-counted number is unauditable — a funder has no way to
check it, and a challenged NGO has no way to defend it.

Three specific failures, and they are the whole problem:

| Failure | Consequence |
|---|---|
| **Media is not evidence.** Edited, re-compressed, or casually re-captioned, with no tamper signal | Every number built on it is disputable. Reports get rejected. |
| **Impact is unquantified.** "Look, trees!" | Donors fund outcomes, not photographs. Counting is manual, slow, and unverifiable. |
| **Nothing is traceable.** A figure cannot be traced to the photo, the model, or the version | A report cannot be defended under audit or challenged in good faith. |

The platform closes all three: capture is signed at the moment of the shutter, change is
measured by a versioned model, and every report carries a hash chain that ties a number to a
photograph, a model version, and a timestamp.

**Who it is for.** Field NGOs and government environment agencies. The field worker is on poor
connectivity; the programme manager needs a donor-ready PDF; the auditor needs the trail.

**What it is not.** Not a DAM, and not a stock library. It is an evidence and measurement system
that happens to store media on Cloudinary.

---

## The Solution

We're building an **end-to-end media intelligence platform** that solves the core problem: NGOs, governments, and sustainability organizations generate massive volumes of field photos/videos but cannot efficiently organize, analyze, verify, or report on them.

**What we deliver:**

- **Tamper-proof capture** — Mobile app creates immutable "git-like" commits: SHA-256 file hash, Ed25519 device signatures in Secure Enclave/Keystore, frozen EXIF (PascalCase), GPS accuracy, dual timestamps (device + server). No post-capture edits possible.
- **Multi-sector intelligence** — Single project supports multiple observation types (water cleanup, road construction, mangrove planting) each with its own ML model, GPS clustering radius, and metrics schema. Pairing happens per observation type with its own radius.
- **AI-powered change detection** — Per-observation-type pairing → GPS clustering → ML routing (Forestry: trained YOLOv8 + ChangeFormer; Water/Infra: base models) → quantified metrics (hectares, counts, % change) + visual diff overlays.
- **Video support (MVP)** — 30s clips, auto-thumbnails, keyframe extraction, keyframe-based change detection, synchronized video diff player, clips embedded in reports.
- **Audit-ready reports** — Template-based PDF/HTML with integrity appendix (hash chain, signatures, timestamps, GPS accuracy), video clips via Cloudinary transforms, manual verification in < 5 minutes.
- **Full traceability** — SHA-256 hash chain in audit logs, dual timestamps (device + server), EXIF hash verification, caption signatures, GPS accuracy recording.

---

## Quick Start (New Chat)

```
This is the Impact Media Intelligence Platform - a monorepo for an AI-powered media intelligence platform.

Key files to start (read in this order):
- PRD.md            - What to build: requirements, acceptance criteria, exit criteria
- ARCHITECTURE.md   - How it is built: topology, data flows, security, decision log
- BUILD_ORDER.md    - What to build first: 12 phases, each with a verifiable gate
- AGENTS.md         - Rules that must not be broken, conventions, definition of done

Reference:
- docs/architecture/DATABASE_SCHEMA.md           - Table DDL, RLS, integrity functions
- docs/architecture/api-contracts.md             - Endpoint contracts
- docs/architecture/CLOUDINARY_TRANSFORMATIONS.md - Verified transformation parameters
- docs/architecture/FILE_STRUCTURE.md            - Monorepo layout detail
- docs/architecture/FRONTEND_ARCHITECTURE.md     - Capture app + dashboard structure
- docs/planning/FINE_TUNING_STRATEGY.md           - Model registry and training plan
- docs/operations/deployment.md                  - Environment setup and deploy
```

---

## Basic Flow of Solution

```
Field Worker → Capture App → Cloudinary → Webhook → API → Supabase
                                    ↓
                              Redis Queue → ML Service → Supabase
                                    ↓
                              Dashboard ← API/Realtime
```

**Step-by-step:**

1. **Capture** — Field worker opens Capture App, selects project/observation type/phase, captures photo/video (30s max). App freezes EXIF, records GPS+accuracy, signs commit with device Ed25519 key, extracts video keyframes.
2. **Upload** — App uploads directly to Cloudinary (unsigned preset, `type: authenticated`) with integrity claims in the `context` field: device signature, GPS+accuracy, caption+signature, EXIF hash, observation type, phase.
3. **Ingest & Verify** — Cloudinary webhook → Node API. API independently re-verifies the device signature, re-hashes the bytes, re-canonicalizes the EXIF per RFC 8785, and derives `org_id` from the verified claim (never the request body). Result is `pass` / `fail` / `unknown`.
4. **AI Enrichment** — API enqueues `ai-enrich` → ML service runs the sector model, and Cloudinary's `categorization` / `detection` output is **copied into** Postgres. `derived_metadata` (`phash`, colors, quality, face count) is harvested once at ingest. Nothing is ever queried back from Cloudinary.
5. **Pairing** — BullMQ `pair-assets` job every 5 min: per observation type, cluster unpaired assets by GPS (`obs_type.gps_radius`) + time → before/after pairs.
6. **Change Detection** — API calls ML `/detect-change` (images) or `/detect-change-video` (video keyframes) with a short-lived internal JWT. ML returns quantified metrics + a rendered red-overlay diff PNG, uploaded as its own derivative with `model_version` recorded. Untrained sectors return `unsupported`.
7. **Report Generation** — Handlebars + Puppeteer. All media is **inlined** into a self-contained artifact plus a `sha256` manifest, so a finalized report renders offline forever. Gen-AI and social variants run as a separate async job (420/423), never inside the request.
8. **Delivery** — Dashboard shows change events, diff slider, map, and integrity cards. Media URLs are minted by the API by `asset_id` under RLS; originals require a 5-minute auth token. Users download the self-contained report.

---

## Architecture at a Glance

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Capture App** | Expo (React Native), `expo-camera` v2, `react-native-keychain` | Tamper-proof capture, Ed25519 in Secure Enclave |
| **Media Core** | Cloudinary | Upload, transformations, AI tagging, video keyframes |
| **Database** | Supabase (PostgreSQL + PostGIS + RLS) | Assets, audit logs, realtime, auth |
| **API** | Node.js 20, Fastify, TypeScript, BullMQ | REST, webhooks, verification, workers |
| **ML Service** | Python 3.11, FastAPI, PyTorch, YOLOv8 | Sector-specific change detection, video keyframes |
| **Dashboard** | React 19, Vite, TanStack Query, MapLibre GL | Search, reports, map, integrity viewer |

---

## Key Differentiators

| Typical Platforms | This Platform |
|-------------------|---------------|
| Upload portal + AI tags | **Tamper-proof capture** + cryptographic proof |
| Manual before/after slider | **Auto GPS clustering** + quantified metrics (hectares, counts) |
| Searchable gallery | **Semantic search** + GPS accuracy filter + observation type filter |
| Manual report compilation | **Template-based PDF** + video clips + integrity appendix |
| Trust-based evidence | **Audit-ready**: hash chain, signatures, dual timestamps, EXIF freeze |

---

## MVP Scope (6 Weeks)

| Phase | Focus | Key Deliverables |
|-------|-------|------------------|
| **Week 1** | Foundation | Monorepo, CI/CD, Supabase schema, Cloudinary preset, shared types |
| **Week 2-3** | Capture & Ingest | Auth, hierarchical picker, photo/video capture, offline queue, webhook verification |
| **Week 3-4** | Intelligence | Forestry YOLOv8 + ChangeFormer, video keyframes, per-obs-type pairing, ML routing |
| **Week 4-5** | Search & Reports | Faceted search, PDF/HTML reports with video clips, integrity appendix |
| **Week 5-6** | Polish | Ghost overlay, GPS threshold, map clustering, load testing, demo script |

### MVP Exit Criteria

> Gate-facing, individually-falsifiable versions of these nine live in
> `docs/architecture/MVP_EXIT_CRITERIA.md`; if the two disagree, that file wins.
> Criteria 1, 2, 3, 5, 8, and 9 are timing / device / deployment judgements that
> require a human on staging and are reported by the agent as
> `BLOCKED (needs user review)` — they stay unchecked until verified on staging.

- [ ] Photo + GPS + accuracy + signature → Dashboard (< 10s)
- [ ] Video (30s) + thumbnail + keyframes → Dashboard (< 15s)
- [ ] Search 1K assets by tag/location/date/GPS accuracy/asset type (< 500ms)
- [ ] 5 photo pairs + 3 video pairs → real metrics + diff images/video
- [ ] Sub-project hierarchy works in capture app picker
- [ ] Single project with 3 observation types routes to correct ML models
- [ ] Forestry donor report PDF with integrity appendix + video clips
- [ ] Manual audit verification passes in < 5 min
- [ ] All 4 services deploy independently from `main`

---

## Project Configuration (Expanded)

### Project Config Schema (`projects.config`)

```json
{
  "name": "Restoration of Nature",
  "sector": "mixed",
  "parent_project_id": null,
  "config": {
    "observation_types": [
      {
        "type": "ganga_cleanup",
        "label": "Ganga Cleanup",
        "model": "water",
        "gps_radius": 10,
        "phase_field": "cleanup_phase"
      },
      {
        "type": "road_construction",
        "label": "Road Construction",
        "model": "infrastructure",
        "gps_radius": 5,
        "phase_field": "build_phase"
      },
      {
        "type": "mangrove_planting",
        "label": "Mangrove Planting",
        "model": "forestry",
        "gps_radius": 5,
        "phase_field": "planting_phase"
      }
    ],
    "report_template": "integrated_restoration_report",
    "gps_cluster_radius_default": 5,
    "metrics_schema": {
      "water_quality_index": "number",
      "debris_removed_kg": "number",
      "km_paved": "number",
      "saplings_planted": "number",
      "survival_rate_pct": "number"
    }
  }
}
```

### Config Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `observation_types[]` | array | Yes | Defines each activity type within the project |
| `observation_types[].type` | string | Yes | Unique key (e.g., `ganga_cleanup`) |
| `observation_types[].label` | string | Yes | Human-readable label for UI |
| `observation_types[].model` | string | Yes | ML model key: `forestry`, `water`, `infrastructure` |
| `observation_types[].gps_radius` | number | Yes | GPS clustering radius in meters |
| `observation_types[].phase_field` | string | Yes | Capture phase field name (`before`/`after`) |
| `report_template` | string | No | Handlebars template name for reports |
| `gps_cluster_radius_default` | number | No | Fallback radius when not specified |
| `metrics_schema` | object | No | JSON schema for custom metrics per obs-type |

### Sub-Project Hierarchy

```
Project: "Restoration of Nature" (parent, sector: mixed)
├── Sub-Project: "Northern Zone" (child)
│   └── Config: { observation_types: [water_cleanup: water, road_build: infrastructure] }
├── Sub-Project: "Southern Zone" (child)
│   └── Config: { observation_types: [mangrove_planting: forestry, survey: forestry] }
└── Sub-Project: "Access Roads" (child)
    └── Config: { observation_types: [road_paving: infrastructure, bridge: infrastructure] }
```

**Database**: `parent_project_id` FK on `projects` table with recursive CTE for tree queries.

### Capture App Flow

1. **Select Project** → Shows hierarchical tree (Parent → Sub-projects)
2. **Select Observation Type** → Dynamically loaded from `project.config.observation_types[]`
3. **Select Phase** → Before / After (from `phase_field`)
4. **Capture** → Photo/Video (30s max) + auto thumbnail + keyframe extraction
5. **Optional Caption** → Signed with device Ed25519 key
6. **Upload** → Cloudinary unsigned preset + full context in `context` field

### Pairing Logic (Per Observation Type)

```python
# For EACH observation_type independently:
for obs_type in project.config.observation_types:
    assets = db.assets.where(
        project_id=project.id,
        observation_type=obs_type.type,  # Filter by obs type FIRST
        phase in ['before', 'after'],
        paired=False
    )
    pairs = cluster_by_gps_and_time(assets, radius=obs_type.gps_radius)
    queue.add('detect-change', {
        ...pair,
        sector: obs_type.model,  # Routes to correct ML model
        observationType: obs_type.type
    })
```

### ML Model Routing

Models resolve from the `model_registry` table. A sector with no trained model returns
`unsupported` — it is **never** served by another sector's model.

```python
def resolve_model(model_key: str) -> ModelRef:
    row = registry.get(model_key)
    if row is None or row.status != "trained":
        # A wrong-sector number in a donor report is a credibility failure.
        raise UnsupportedSector(model_key, reason=row.status if row else "not_registered")
    return ModelRef(key=row.key, version=row.version, sector=row.sector)
```

| key | MVP status |
|-----|------------|
| `forestry` | `trained` (placeholder — no weights exist yet) |
| `water` | `unsupported` |
| `infrastructure` | `unsupported` |
| `agriculture` | `unsupported` |

---

## Data Models & Schema

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `orgs` | Organizations (gov, NGO, partner) | `id`, `name`, `type`, `settings` |
| `projects` | Projects with sector config | `id`, `org_id`, `name`, `sector`, `geometry`, `config` (JSONB), `parent_project_id` |
| `assets` | Photos/videos from capture app | `id`, `project_id`, `cloudinary_public_id`, `asset_type`, `device_capture_timestamp`, `gps_point`, `gps_accuracy_meters`, `device_id`, `device_public_key`, `capture_signature`, `sha256_hash`, `exif`, `exif_hash`, `ai_tags`, `custom_metadata`, `observation_type`, `phase`, `caption`, `caption_signature`, `server_upload_timestamp`, `server_received_at`, `upload_status` |
| `observations` | Structured field notes | `id`, `asset_id`, `project_id`, `observation_type`, `metrics` (JSONB), `notes` |
| `change_events` | Before/after pairs with metrics | `id`, `project_id`, `before_asset_id`, `after_asset_id`, `change_type`, `change_metrics` (JSONB), `confidence`, `diff_asset_cloudinary_id` |
| `evidence_packages` | Compiled donor reports | `id`, `project_id`, `asset_ids[]`, `change_event_ids[]`, `report_cloudinary_url`, `audit_trail` (JSONB) |
| `audit_logs` | Immutable hash chain | `id`, `asset_id`, `action`, `actor_type`, `actor_id`, `details`, `previous_hash`, `current_hash` |
| `report_templates` | Handlebars templates | `id`, `org_id`, `sector`, `name`, `handlebars_template`, `config` |

### Key Integrity Columns (Assets Table)

| Column | Purpose |
|--------|---------|
| `device_capture_timestamp` | Device clock at capture (immutable) |
| `device_commit_hash` | SHA-256 of image bytes = commit ID |
| `device_id` / `device_public_key` | Hardware-backed Ed25519 identity |
| `capture_signature` | Ed25519 signature of commit hash |
| `gps_accuracy_meters` | Horizontal accuracy from fused provider |
| `gps_provider` | `gps` \| `network` \| `fused` \| `passive` |
| `exif_hash` | SHA-256 of frozen EXIF (canonical JSON) |
| `sha256_hash` | SHA-256 of original file |
| `caption` / `caption_signature` | Optional signed caption |
| `server_upload_timestamp` | Cloudinary server time (immutable) |
| `server_received_at` | API receipt time (immutable) |

### Indexes for Performance

```sql
CREATE INDEX idx_assets_project_time ON assets(project_id, device_capture_timestamp);
CREATE INDEX idx_assets_gps ON assets USING GIST(gps_point);
CREATE INDEX idx_assets_gps_accuracy ON assets(gps_accuracy_meters) WHERE gps_accuracy_meters IS NOT NULL;
CREATE INDEX idx_assets_commit_hash ON assets(device_commit_hash);
CREATE INDEX idx_assets_observation ON assets(project_id, observation_type, phase);
CREATE INDEX idx_change_project ON change_events(project_id);
```

---

## API Endpoints

### Assets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:id/assets` | List assets with filters: `bbox`, `date_from`, `date_to`, `tags`, `gps_accuracy_max`, `observation_type`, `phase` |
| GET | `/api/assets/:id/integrity` | Integrity check: device/server timestamps, GPS accuracy, signatures |
| GET | `/api/assets/:id/audit-trail` | Full hash chain + transformation history |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List org's projects |
| GET | `/api/projects/:id` | Project detail + config |
| POST | `/api/projects` | Create project with config |

### Change Events
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:id/change-events` | List before/after pairs with metrics |
| GET | `/api/change-events/:id` | Single change event + diff URL |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/reports/generate` | Body: `{project_id, template, change_event_ids}` → Returns `{pdf_url, html_url, social_assets[]}` |
| GET | `/api/report-templates?sector=forestry` | List templates by sector |

### Search
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search` | Query: `q`, `bbox`, `date_from`, `date_to`, `tags`, `gps_accuracy_max`, `asset_type` |

### Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhooks/cloudinary` | Cloudinary upload notification → verification → storage |

---

## ML Pipeline Details

### Models

| Model | Purpose | Training Data | Status |
|-------|---------|---------------|--------|
| **Sapling Detector (YOLOv8n)** | Count/locate saplings | ForestNet (1.2M patches) + 200 pilot | Trained (MVP) |
| **Change Detector (ChangeFormer)** | Before/after diff | LEVIR-CD (637 pairs) + 100 pilot | Trained (MVP) |
| **Base COCO YOLOv8n** | Person/machinery detection | COCO | Pre-trained (free) |

### ML Service Endpoints

| Endpoint | Input | Output |
|----------|-------|--------|
| `POST /detect-change` | `{before_url, after_url, sector, gps_before, gps_after, accuracy_before, accuracy_after}` | `{change_type, change_metrics, confidence, diff_url}` |
| `POST /detect-change-video` | `{before_keyframes[], after_keyframes[], sector, ...}` | `{change_type, change_metrics, confidence, diff_url}` |
| `POST /classify-activity` | `{asset_url, sector}` | `{activity_type, phase, confidence, indicators}` |
| `POST /extract-signals` | `{asset_url, sector}` | `{vegetation_index, water_present, smoke, machinery[], bare_ground_pct, canopy_cover_pct}` |

### Video Processing (MVP)

1. **Capture** — 30s max, auto thumbnail, keyframe extraction (every 2s or scene change)
2. **Keyframe Extraction** — FFmpeg extracts I-frames + scene changes
3. **Alignment** — GPS rough alignment + ORB feature matching + homography warp
4. **Change Detection** — Run sapling detector on aligned keyframe pairs → aggregate metrics
5. **Diff Visualization** — First keyframe pair → red overlay diff → Cloudinary upload

---

## Generative AI for Reports (Derivative Assets Only)

> **Guardrail**: All generative AI runs **only on derivative/report assets** — never on source evidence. Source assets (SHA-256, EXIF hash, audit chain) remain pristine.

### Generative AI Use Cases (Report Assets Only)

All parameters below verified against Cloudinary's official transformation reference. See `docs/architecture/CLOUDINARY_TRANSFORMATIONS.md` for the full audit.

| Category | Feature | Cloudinary Parameter | Use Case | PS Alignment |
|----------|---------|---------------------|----------|--------------|
| **Privacy/GDPR** | Generative Remove | `e_gen_remove:prompt_person` | Remove people from report exports | GDPR-ready, Privacy |
| **Privacy/GDPR** | Face Blur | `e_blur_faces` | Blur faces without altering the scene | GDPR-ready, Privacy |
| **Privacy/GDPR** | Remove Text | `e_gen_remove:prompt_text` | Strip text/logos from report images | GDPR-ready, Privacy |
| **Quality** | Auto Enhance | `e_auto_enhance`, `e_auto_contrast` | Improve lighting/contrast for report visibility | Visual reports |
| **Quality** | Restore | `e_gen_restore` | Recover detail in degraded field photos | Visual reports |
| **Layout** | Generative Expand | `b_gen_fill` with `ar_16:9,c_pad` | Extend images to 16:9 / 4:3 / 9:16 for layouts | Campaign-ready content |
| **Layout** | Auto Crop | `c_fill_pad,g_auto,ar_16:9,w_1080,h_1350` | Smart crop that pads instead of cutting evidence out | Campaign-ready content |
| **Branding** | Generative Recolor | `e_gen_recolor:prompt_<subject>;to-color_1B5E3F` | Standardize color grading across report images | Campaign-ready content |
| **Branding** | Background Replace | `e_gen_background_replace` | Swap background for branded layouts | Campaign-ready content |
| **Accessibility** | AI Captioning | *add-on API call* — not a URL transform | Alt-text for report accessibility & search | Semantic search, Audit-ready |
| **Multilingual** | AI Translation | *add-on API call* — not a URL transform | Translate captions for international donor reports | Campaign-ready content |
| **Analytics** | Object Counting | **Our CV model** — `change_events.model_version` | Count saplings/equipment for report metrics | Quantified impact metrics |
| **Analytics** | Anomaly Detection | **Our CV model** — `change_events.model_version` | Flag unusual changes for reviewer attention | AI-powered change detection |
| **Report Automation** | AI Summarization | LLM over already-computed metrics | Executive summary — never produces a number | Audit-ready reports |

**Not Cloudinary transformations:** captioning, translation, object counting, anomaly detection, and summarization. The first two are add-on API calls; the last three must come from our versioned CV model per `AGENTS.md` §3.2.

> **Async gotcha:** `b_gen_fill` and `e_gen_recolor` return **423 Locked** while generating. Never `fetch()` them synchronously — use eager transformations at upload and read `secure_url` from the response.

### Implementation Guardrails (Derivative-Only)

```typescript
// Guardrail: NEVER apply generative AI to originals
function assertDerivativeAsset(asset: Asset): asserts asset is DerivativeAsset {
  if (!asset.isDerivative) {
    throw new Error(`SECURITY VIOLATION: Generative AI cannot be applied to original asset ${asset.id}`);
  }
  if (asset.sha256_hash !== asset.originalSha256) {
    throw new Error(`SECURITY VIOLATION: Asset ${asset.id} hash mismatch - possible tampering`);
  }
}

// All generative AI functions require derivative asset
async function applyGenerativeAI(asset: DerivativeAsset, options: GenerativeOptions) {
  assertDerivativeAsset(asset);
  // ... apply transformations via Cloudinary
}
```

### Generative AI Budget (Cloudinary)

> ⚠️ **Pricing below is unverified.** Confirm current rates in the Cloudinary Console → Usage before committing to a budget. Cloudinary bills `b_gen_fill` and `e_gen_recolor` under a *special transformation count* that is higher than a standard transform.

| Feature | Est. Cost/Image | MVP Recommendation |
|---------|----------------|-------------------|
| `e_gen_remove` | ~$0.008 | ✅ Enable (privacy) |
| `b_gen_fill` | ~$0.01 | ✅ Enable (reports) |
| `e_gen_recolor` | ~$0.005 | ✅ Enable (branding) |
| `e_gen_restore` | ~$0.02 | ⚠️ Limit to key report images |
| `e_auto_enhance` | ~$0.001 | ✅ Enable (cheap, high value) |
| `e_blur_faces` | ~$0.001 | ✅ Enable (privacy) |
| Captioning / Translation | add-on API, per call | ⚠️ Priced separately; batch per report |
| Object count / Anomaly | **our model, $0 marginal** | ✅ Enable — no Cloudinary cost |

**Rule:** block generative spend at 80% of the monthly per-org cap with an admin warning. Non-generative transforms (`f_auto`, `q_auto`, `c_*`, `g_auto`) are effectively free and should be applied everywhere.

---

## Cloudinary Startup Kit Integration (Hackathon Ready)

> **Leverage Cloudinary's Hackathon Startup Kit** for accelerated development:  
> 🔗 **Apply here**: https://cloudinary.com/pages/hackathons/

### What the Kit Provides

> ⚠️ **Verify before relying on this.** Confirm the current terms on the application page.

| Benefit | Details |
|---------|---------|
| **Free Credits** | Apply for hackathon credits — amount and duration per current program |
| **Generative AI Access** | Access to generative transformations (Remove, Fill, Recolor, Replace, Restore) |
| **Video API** | Video transcoding, streaming profiles, clip extraction |
| **AI Transformations** | Auto-tagging, auto-enhance, background removal (add-ons) |
| **Support** | Community/priority channels during the hackathon |

### Quick Start with Startup Kit

```bash
# 1. Sign up at cloudinary.com/pages/hackathons/
# 2. Get your credentials (cloud_name, api_key, api_secret)
# 3. Add to your .env.local — SERVER ONLY, never in a client bundle
CLOUDINARY_CLOUD_NAME=<cloud-name>
CLOUDINARY_API_KEY=<cloudinary-api-key>
CLOUDINARY_API_SECRET=<cloudinary-api-secret>
CLOUDINARY_UPLOAD_PRESET=verified_capture
```

### Hackathon-Specific Cloudinary Features Used

| Feature | Implementation | PS Alignment |
|---------|----------------|--------------|
| **Generative AI** | `e_gen_remove`, `b_gen_fill`, `e_gen_recolor`, `e_gen_restore` | Report generation |
| **Video API** | Clip extraction (`so_`/`eo_`/`du_`), `sp_auto` streaming | Video evidence |
| **AI Auto-tagging** | `categorization: "google_tagging"` (upload param) | Semantic search |
| **Smart Cropping** | `c_lfill,g_auto,ar_16:9` | Report layouts. `lfill` never upscales. |
| **Auto-enhance** | `e_auto_enhance`, `e_auto_contrast`, `e_improve` | Report quality |
| **Privacy** | `e_blur_faces`, `e_gen_remove:prompt_text` | GDPR |
| **Signed URLs** | `cloudinary.utils.cloudinary_url(..., sign_url=True)` | Secure delivery |
| **Named Transformations** | `report_thumb`, `report_full`, `report_social`, `report_diff` | Consistent reports |

### Quick Start Code (ML Service)

```python
# apps/ml-service/src/services/cloudinary.py
from __future__ import annotations

import os

import cloudinary
import cloudinary.uploader
import cloudinary.utils

cloudinary.config(
    cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
    api_key=os.environ["CLOUDINARY_API_KEY"],
    api_secret=os.environ["CLOUDINARY_API_SECRET"],
    secure=True,
)


def upload_evidence(image_path: str, public_id: str, context: dict[str, str]) -> dict:
    """Upload original evidence. Never apply generative transforms here."""
    return cloudinary.uploader.upload(
        image_path,
        public_id=public_id,
        overwrite=False,
        invalidate=False,
        context=context,
        categorization="google_tagging",
        auto_tagging=0.7,
        detection="openimages",
        moderation="webpurify",
        tags=["verified-capture"],
        eager=[
            {"width": 400, "height": 300, "crop": "fill", "gravity": "auto",
             "quality": "auto:eco", "format": "auto"},
        ],
    )


def build_report_derivatives(asset_public_id: str, options: dict) -> dict[str, str]:
    """Build delivery URLs for report copies. Generative params are verified;
    see docs/architecture/CLOUDINARY_TRANSFORMATIONS.md.

    Generative transforms are ASYNC (423 Locked while generating). Do not fetch
    these synchronously — register them as eager transformations at upload and
    read secure_url from the response instead.
    """
    transforms: list[str] = []

    if options.get("remove_people"):
        transforms.append("e_gen_remove:prompt_person")
    if options.get("remove_text"):
        transforms.append("e_gen_remove:prompt_text")
    if options.get("blur_faces"):
        transforms.append("e_blur_faces")
    if options.get("expand_16_9"):
        transforms.append("ar_16:9/c_pad/b_gen_fill")
    if options.get("recolor_subject"):
        transforms.append(
            f"e_gen_recolor:prompt_{options['recolor_subject']};to-color_1B5E3F"
        )
    if options.get("restore"):
        transforms.append("e_gen_restore")
    if options.get("enhance", True):
        transforms.append("e_auto_enhance")

    transforms.append("q_auto:eco/f_auto")

    return cloudinary.utils.cloudinary_url(
        asset_public_id,
        transformation="/".join(transforms),
        sign_url=True,
    )
```

---

## PS Alignment Check

| PS Requirement | Generative AI Use | Verdict |
|----------------|-------------------|---------|
| "Analyze and intelligently organize" | AI tagging/captioning on derivatives | ✅ |
| "Compare before-and-after" | Diff from originals, generative only on report copies | ✅ |
| "Searchable through AI-powered metadata" | AI tags on derivatives + originals | ✅ |
| "Identify relevant projects/activities/locations" | AI tags + GPS on originals | ✅ |
| "Generate visual reports" | Generative AI on report derivatives | ✅ |
| "Preserve traceability to original source assets and transformations" | **Originals never modified** | ✅ |

---

## Bottom Line

**Yes, use generative AI** — but **only on derivative report assets** (thumbnails, social clips, report PDFs). The **source evidence assets in Supabase/Cloudinary must remain pristine** — their SHA-256, EXIF hash, and audit chain must remain unbroken. Generative AI is a **report-generation tool**, not an evidence-processing tool.

---

## Security & Compliance

### Tamper-Proof Guarantees

| Threat | Mitigation |
|--------|------------|
| EXIF edited before upload | Frozen at capture (PascalCase only), hash verified server-side |
| GPS spoofed | Accuracy recorded, provider logged, dual timestamps |
| Caption added post-capture | Signed at capture with device Ed25519 key |
| File swapped | Content-addressable storage (SHA-256 = filename) |
| Backdated capture | Device timestamp + server timestamp dual-recorded |
| App tampering | Code signing (Expo EAS) + hardware-backed keys |

### Audit Trail

- **Immutable hash chain** — `audit_logs` with SHA-256 chain: `current_hash = SHA256(previous_hash + action + actor + timestamp)`
- **Verification function** — `verify_asset_integrity(asset_id)` returns 5 checks, each `pass` / `fail` / `unknown`: EXIF hash, SHA-256 match, caption signature, sync delay, audit chain
- **Timestamps** — `device_capture_timestamp` + `device_monotonic_ms` (device), `upload_started_at` (client, pre-upload), `server_received_at` (API), `cloudinary_created_at` (media core)
- **Offline dwell** — `sync_delay_seconds = server_received_at - upload_started_at`
- **Clock skew** — requires a signed NTP offset. Without one the check returns `unknown`, **never `pass`**. Note that `server_received_at - device_capture_timestamp` conflates dwell, skew and latency and is not a skew measurement.

### Compliance

- **GDPR-ready** — Org-scoped RLS, data minimization, right to deletion via `upload_status = 'deleted'`
- **Org isolation** — RLS policies: `org_id = auth.jwt() ->> 'org_id'` on all tables
- **Secret management** — 1Password (local), GitHub Actions Secrets (CI), Platform env vars (prod), Supabase Vault (Edge Functions)

---

## Deployment & Operations

### Environments

| Service | Platform | Auto-Deploy |
|---------|----------|-------------|
| Dashboard | Vercel | `main` branch |
| Node API | Railway/Render | `main` branch |
| ML Service | Fly.io | `main` branch |
| Capture App | Expo EAS | Manual/Release |
| Database | Supabase | Managed |
| Media | Cloudinary | Managed |
| Queue | Redis (Railway/Upstash) | Managed |

### CI/CD (GitHub Actions)

| Workflow | Trigger | Actions |
|----------|---------|---------|
| `ci.yml` | PR to main | Lint, typecheck, test all packages |
| `deploy-api.yml` | Push to main (apps/api/*) | Railway deploy |
| `deploy-ml.yml` | Push to main (apps/ml-service/*) | Fly.io deploy |
| `deploy-dashboard.yml` | Push to main (apps/dashboard/*) | Vercel deploy |
| `deploy-app.yml` | Manual / tag | EAS Build (iOS/Android) |

### Secret Rotation

| Frequency | Secrets | Process |
|-----------|---------|---------|
| Monthly | Cloudinary API Secret, Supabase Service Key, Redis Password | Regenerate in provider → update Railway/Fly.io/Vercel → deploy |
| Quarterly | Cloudinary API Key, Supabase Anon Key, JWT keys, Webhook keys | Same as monthly |
| Incident | Any compromised secret | Revoke in provider → generate new → deploy within 1 hour |

### Monitoring

- **Health checks** — `/health` on API & ML Service
- **Logging** — Structured JSON logs (Pino/Zap), correlated via request ID
- **Error tracking** — Sentry (optional, DSN in env)
- **Metrics** — Prometheus + Grafana (self-hosted) or Datadog
- **Key metrics** — Upload latency, change detection time, report generation time, error rates

---

## Testing Strategy

| Layer | Tool | Coverage Target |
|-------|------|-----------------|
| Unit (API) | Vitest + Supertest | 80% |
| Unit (ML) | pytest + pytest-cov | 70% |
| Integration | Testcontainers (Supabase, Redis) | Critical paths |
| E2E (Dashboard) | Playwright | Critical user flows |
| E2E (Capture App) | Detox | Capture → upload → verify |
| Contract | Pact | API ↔ ML Service |

### Verification Gates (Definition of Done)

- [ ] Code compiles (`pnpm typecheck` passes)
- [ ] Lint passes (`pnpm lint`)
- [ ] Unit tests pass (`pnpm test`)
- [ ] Integration test: works with local Supabase + Cloudinary
- [ ] **Capture app: Immutable commit created, signed, verified server-side**
- [ ] **EXIF freeze verified (no editable fields, PascalCase keys)**
- [ ] **GPS accuracy recorded and displayed**
- [ ] **Caption signing works and verified**
- [ ] **Dual timestamps stored and displayed**
- [ ] Docs updated (README, API spec, schema)
- [ ] PR approved by 1 teammate
- [ ] Deployed to staging (auto on merge to main)

---

## Glossary

| Term | Definition |
|------|------------|
| **Observation Type** | A category of field activity (e.g., `ganga_cleanup`, `road_construction`, `mangrove_planting`) with its own ML model, GPS radius, and phase field |
| **Observation Phase** | `before` (baseline) or `after` (post-intervention) — captured via `phase_field` in config |
| **Pairing** | Automatic clustering of before/after assets by GPS proximity and time, per observation type |
| **Change Event** | A verified before/after pair with quantified metrics and diff visualization |
| **Commit (Capture)** | Immutable local record: SHA-256 of image bytes + Ed25519 signature + frozen metadata |
| **Asset** | A photo/video uploaded to Cloudinary with all integrity metadata stored in Supabase |
| **Change Metrics** | Quantified impact: hectares, counts, percentages, density — sector-specific |
| **Diff Visualization** | Cloudinary-generated red overlay showing pixel-level changes between before/after |
| **Evidence Package** | Compiled donor report: PDF + HTML + video clips + integrity appendix |
| **Hash Chain** | SHA-256 chain in `audit_logs`: each entry hashes previous_hash + action + actor + timestamp |

---

## FAQ

**Q: Can the Capture App work offline?**
A: Yes. Commits are stored in encrypted MMKV locally, queued for upload. Background sync via `expo-background-fetch` when connectivity returns (iOS: chunked, 3 max per cycle).

**Q: What if GPS accuracy is poor?**
A: Configurable threshold (default 10m). App shows real-time accuracy; capture button disabled if above threshold. Accuracy stored with asset for downstream filtering.

**Q: Can external partners (grantees) use the app?**
A: Yes. They get their own org in Supabase, use the same Capture App with their org's projects. RLS ensures org isolation.

**Q: How are sub-projects different from observation types?**
A: **Sub-projects** = geographic/administrative separation (different teams, permissions, reports). **Observation types** = activity categories within a project (different ML models, radii). A sub-project can have multiple observation types.

**Q: What happens if ML model is wrong?**
A: Confidence scores returned with every detection. Low-confidence events flagged for human review. Dashboard shows confidence badges. Manual override possible via dashboard.

**Q: How is video change detection different from photos?**
A: Videos → keyframe extraction → GPS+feature alignment → per-frame change detection → aggregate metrics + first-frame diff visualization. More compute, same output format.

**Q: Can we add a new sector later?**
A: Yes. Add new `SectorModel` class, register in `SECTOR_MODELS`, add project config with new `observation_type`. No platform code changes.

**Q: How is EXIF hash verified?**
A: Client computes SHA-256 of frozen EXIF (canonical JSON: sorted keys, no whitespace) → sends `exif_hash` in context. Server re-computes from Cloudinary's preserved EXIF → matches.

**Q: What if Cloudinary goes down?**
A: Capture app queues locally. Supabase/Redis/API can run independently. Cloudinary only needed for upload/transform/delivery — not for core auth or data integrity.

---

## File Map (Key Files)

```
cloudinary/
├── README.md                           # ← You are here
├── apps/
│   ├── capture-app/          # Expo React Native (iOS/Android)
│   ├── dashboard/            # React + Vite (Web)
│   ├── api/                  # Node.js Fastify Backend
│   └── ml-service/           # Python FastAPI ML Service
├── packages/
│   ├── shared/               # Shared TS types, Zod schemas
│   └── ui-components/        # Shared React component library
├── docs/
│   ├── specs/                # Requirements
│   ├── architecture/         # System design
│   ├── planning/             # Build plan & ML strategy
│   ├── operations/           # Deployment & secrets
│   └── audit/                # Historical analysis
├── turbo.json                # Turborepo config
├── pnpm-workspace.yaml       # pnpm workspaces
├── tsconfig.base.json        # Base TS config
└── .github/workflows/        # CI/CD
```

---

## Support & Contacts

| Area | Contact |
|------|---------|
| Platform/Architecture | [Architecture Lead] |
| Backend/API | [Backend Lead] |
| ML/Models | [ML Lead] |
| Frontend/Capture App | [Frontend Lead] |
| DevOps/Infra | [DevOps Lead] |
| Security/Compliance | [Security Lead] |

---

*Last updated: 2025-09-25 | Version: MVP-1.0*