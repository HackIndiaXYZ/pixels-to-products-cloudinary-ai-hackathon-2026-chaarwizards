# Product Requirements Document (PRD)
# Impact Media Intelligence Platform

**Version:** 1.0  
**Status:** Approved for Development  
**Target:** MVP Launch in 6 Weeks  
**Last Updated:** 2025-09-25

---

## 1. Product Overview

### 1.1 Vision Statement
Build an AI-powered media intelligence platform that transforms raw field media (photos & videos) from NGOs, governments, and sustainability organizations into **searchable evidence**, **quantified impact metrics**, and **audit-ready visual reports**.

### 1.2 Problem Statement
NGOs, governments, and sustainability organizations generate massive volumes of field photos/videos but cannot efficiently:
- Organize media by project, location, timeline
- Verify authenticity and prevent tampering
- Compare before/after to quantify impact
- Generate donor-ready reports quickly
- Maintain chain of custody for evidence

### 1.3 Solution
An end-to-end platform with:
- **Tamper-proof mobile capture** (immutable commits, Ed25519 signatures, frozen EXIF)
- **Multi-sector AI analysis** (per-observation-type ML routing)
- **Automated before/after pairing** (GPS + temporal clustering)
- **Quantified change detection** (hectares, counts, % change + visual diffs)
- **Audit-ready reports** (PDF/HTML with integrity appendix, video clips)
- **Full traceability** (SHA-256 hash chain, dual timestamps, EXIF verification)

---

## 2. User Personas

| Persona | Role | Primary Needs |
|---------|------|---------------|
| **Field Worker** | NGO/Gov field staff | Capture geo-tagged, timestamped, signed media offline; minimal UI friction |
| **Program Manager** | Project oversight | View project progress, verify evidence, generate donor reports |
| **Donor/Funder** | Grant oversight | Verify impact claims, audit evidence chain, download reports |
| **ML Engineer** | Model development | Train/deploy sector models, monitor drift, retrain pipeline |
| **DevOps/Platform** | Infrastructure | Deploy, monitor, rotate secrets, ensure uptime |

---

## 3. Functional Requirements

### FR1: Tamper-Proof Capture
| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR1.1 | Capture app creates immutable commit per photo/video | P0 | SHA-256 of file = commit ID; stored in encrypted MMKV |
| FR1.2 | Ed25519 signature at capture time | P0 | Device key in Secure Enclave/Keystore; signature covers commit hash |
| FR1.3 | EXIF frozen at capture (PascalCase keys only) | P0 | Editable fields stripped; hash verified server-side |
| FR1.4 | GPS + accuracy recorded from fused provider | P0 | Accuracy in meters stored; capture blocked if > threshold (default 10m) |
| FR1.5 | Dual timestamps (device + server) | P0 | Device timestamp + Cloudinary server timestamp + API receipt time |
| FR1.6 | Optional caption signed at capture | P1 | Caption + timestamp signed with device Ed25519 key |
| FR1.7 | Offline queue with background sync | P0 | MMKV local storage; expo-background-fetch sync (iOS: 3 max/cycle) |
| FR1.8 | Video capture (30s max) with keyframes | P1 | Auto thumbnail, keyframe extraction every 2s/scene change |

### FR2: Multi-Sector Project Configuration
| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR2.1 | Project config supports multiple observation types | P0 | `observation_types[]` with `type`, `label`, `model`, `gps_radius`, `phase_field` |
| FR2.2 | Sub-project hierarchy support | P1 | `parent_project_id` FK; recursive CTE for tree queries |
| FR2.3 | Per-observation-type ML model routing | P0 | `obs_type.model` → `SECTOR_MODELS[model]` |
| FR2.4 | Per-observation-type GPS clustering radius | P0 | `obs_type.gps_radius` used in pairing clustering |
| FR2.5 | Custom metrics schema per observation type | P1 | `metrics_schema` JSON schema for custom fields |

### FR3: Ingestion & Verification
| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR3.1 | Direct Cloudinary upload (unsigned preset) | P0 | App → Cloudinary; context field carries all integrity metadata |
| FR3.2 | Webhook verification (device sig, EXIF hash, caption sig) | P0 | API verifies all signatures; rejects invalid uploads |
| FR3.3 | Dual timestamps stored | P0 | `device_capture_timestamp` + `server_upload_timestamp` + `server_received_at` |
| FR3.4 | EXIF hash verification | P0 | Canonical JSON (sorted keys) SHA-256 matches client `exif_hash` |
| FR3.5 | Asset stored with integrity metadata | P0 | All integrity fields in `assets` table; `upload_status` tracked |
| FR3.6 | AI enrichment queue | P1 | `ai-enrich` job → Cloudinary auto-tag + custom models → tags stored |

### FR4: Automated Pairing & Change Detection
| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR4.1 | Pairing per observation type | P0 | Filter by `observation_type` FIRST, then GPS cluster + time |
| FR4.2 | GPS clustering per observation type radius | P0 | `obs_type.gps_radius` (default 5m, water=10m, infra=3m) |
| FR4.3 | ML model routing per observation type | P0 | `obs_type.model` → `SECTOR_MODELS[model]` |
| FR4.3 | Image change detection (YOLOv8 + ChangeFormer) | P0 | Returns metrics + diff URL; stored as `change_event` |
| FR4.4 | Video change detection (keyframe-based) | P1 | Keyframe extraction → alignment → per-frame detection → aggregate |
| FR4.5 | Diff visualization (red overlay) | P0 | ML service renders the mask to a PNG, uploads it as a derivative, stores `diff_asset_cloudinary_id`. **No Cloudinary diff effect exists** — see `docs/architecture/CLOUDINARY_TRANSFORMATIONS.md` §3 |

### FR5: Search & Discovery
| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR5.1 | Faceted search (tags, GPS bbox, date, GPS accuracy, asset type) | P0 | `< 500ms` for 1K assets |
| FR5.2 | Geo-spatial queries (PostGIS) | P0 | Bounding box + radius queries |
| FR5.3 | Full-text search on tags/captions | P1 | PostgreSQL tsvector + Cloudinary tags |

### FR6: Report Generation
| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR6.1 | Template-based PDF/HTML (Handlebars + Puppeteer) | P0 | Branded, with diff overlays, metrics tables, map |
| FR6.2 | Integrity appendix (hash chain, signatures, timestamps) | P0 | Auto-appended to every report |
| FR6.3 | Video clips embedded via Cloudinary transforms | P1 | `so_0,eo_10,du_5` clips embedded in HTML/PDF |
| FR6.3 | Generative AI on derivative assets only | P1 | `e_gen_remove`, `b_gen_fill`, `e_gen_recolor` on report copies only. Captioning/translation are add-on **API** calls, not transforms |

### FR7: Audit & Traceability
| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR7.1 | SHA-256 hash chain in `audit_logs` | P0 | `current_hash = SHA256(previous_hash + action + actor + timestamp)` |
| FR7.2 | Verification function `verify_asset_integrity(asset_id)` | P0 | 5 checks, each `pass`/`fail`/`unknown`: EXIF hash, SHA-256 match, caption signature, sync delay, audit chain |
| FR7.3 | Offline dwell isolated from clock skew | P0 | `sync_delay_seconds = server_received_at - upload_started_at` measures dwell. Clock skew requires a signed NTP offset; without one the skew check returns `unknown`, **never `pass`**. `server_received_at - device_capture_timestamp` mixes dwell + skew + latency and must not be presented as a skew check |
| FR7.4 | Timestamps stored | P0 | `device_capture_timestamp`, `device_monotonic_ms`, `upload_started_at`, `server_received_at`, `cloudinary_created_at` |

---

## 4. Non-Functional Requirements

| Category | Requirement | Target |
|----------|-------------|--------|
| **Performance** | Upload → Dashboard | < 10s (photo), < 15s (video) |
| **Performance** | Search 1K assets | < 500ms |
| **Performance** | Report generation (20 pairs) | < 30s |
| **Performance** | Change detection (pair) | < 5s |
| **Scalability** | Assets per project | 10,000+ |
| **Scalability** | Concurrent users | 50+ |
| **Availability** | Uptime | 99.9% |
| **Security** | Data encryption | AES-256 at rest, TLS 1.3 in transit |
| **Security** | Org isolation | RLS on all tables |
| **Compliance** | GDPR | Right to deletion, data minimization |
| **Offline** | Capture app offline support | Full capture + queue; sync on reconnect |
| **Availability** | ML service | Horizontal scaling via Fly.io |

---

## 5. Technical Architecture

### 5.1 System Components

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| **Capture App** | Expo (React Native), `expo-camera` v2, `react-native-keychain` | Tamper-proof capture, Ed25519 in Secure Enclave |
| **Media Core** | Cloudinary | Upload, transformations, AI tagging, video keyframes |
| **Database** | Supabase (PostgreSQL + PostGIS + RLS) | Assets, audit logs, realtime, auth |
| **API** | Node.js 20, Fastify, TypeScript, BullMQ | REST, webhooks, verification, workers |
| **ML Service** | Python 3.11, FastAPI, PyTorch, YOLOv8 | Sector-specific change detection, video keyframes |
| **Dashboard** | React 19, Vite, TanStack Query, MapLibre GL | Search, reports, map, integrity viewer |

### 5.2 Data Flow

```
Field Worker → Capture App → Cloudinary → Webhook → API → Supabase
                                    ↓
                              Redis Queue → ML Service → Supabase
                                    ↓
                              Dashboard ← API/Realtime
```

### 5.3 Key Integrations

| Integration | Purpose | Method |
|-------------|---------|--------|
| Cloudinary Upload | Direct unsigned upload from app | Unsigned preset + context metadata |
| Cloudinary Webhook | Ingest trigger | POST `/webhooks/cloudinary` |
| Cloudinary Transformations | Diff overlays, thumbnails, video clips | Named transformations + signed URLs |
| ML Service API | Change detection, classification | REST (FastAPI) |
| Supabase Realtime | Dashboard live updates | Postgres changes → WebSocket |
| BullMQ + Redis | Async job queue | `ai-enrich`, `pair-assets`, `detect-change`, `generate-report` |

---

## 6. Data Models

### Core Tables (7)

| Table | Purpose | Key Integrity Columns |
|-------|---------|----------------------|
| `orgs` | Organizations | `id`, `name`, `type` |
| `projects` | Projects with sector config | `id`, `org_id`, `config` (JSONB), `parent_project_id` |
| `assets` | Photos/videos | `device_capture_timestamp`, `gps_point`, `gps_accuracy_meters`, `device_id`, `device_public_key`, `capture_signature`, `sha256_hash`, `exif`, `exif_hash`, `caption`, `caption_signature`, `server_upload_timestamp`, `server_received_at`, `upload_status` |
| `observations` | Structured field notes | `asset_id`, `project_id`, `observation_type`, `metrics` (JSONB) |
| `change_events` | Before/after pairs | `before_asset_id`, `after_asset_id`, `change_type`, `change_metrics` (JSONB), `confidence`, `diff_asset_cloudinary_id` |
| `evidence_packages` | Compiled donor reports | `asset_ids[]`, `change_event_ids[]`, `report_cloudinary_url`, `audit_trail` |
| `audit_logs` | Immutable hash chain | `action`, `actor_type`, `actor_id`, `details`, `previous_hash`, `current_hash` |

### Key Integrity Columns (assets)

| Column | Purpose |
|--------|---------|
| `device_capture_timestamp` | Device clock at capture (immutable) |
| `device_commit_hash` | SHA-256 = commit ID |
| `device_id` / `device_public_key` | Hardware-backed Ed25519 identity |
| `capture_signature` | Ed25519 signature of commit hash |
| `gps_accuracy_meters` | Horizontal accuracy from fused provider |
| `exif_hash` | SHA-256 of frozen EXIF (canonical JSON) |
| `sha256_hash` | SHA-256 of original file |
| `caption` / `caption_signature` | Optional signed caption |
| `server_upload_timestamp` / `server_received_at` | Dual timestamps |

---

## 7. API Contracts

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:id/assets` | List assets with filters (bbox, date, tags, GPS accuracy, obs_type, phase) |
| GET | `/api/assets/:id/integrity` | Integrity check: timestamps, GPS accuracy, signatures |
| GET | `/api/assets/:id/audit-trail` | Full hash chain + transformation history |
| GET | `/api/projects/:id/change-events` | List before/after pairs with metrics |
| POST | `/api/reports/generate` | Generate report → `{pdf_url, html_url, social_assets[]}` |
| GET | `/api/search` | Query: `q`, `bbox`, `date_from`, `date_to`, `tags`, `gps_accuracy_max`, `asset_type` |
| POST | `/webhooks/cloudinary` | Cloudinary upload notification → verification → storage |

### ML Service Endpoints

| Endpoint | Input | Output |
|----------|-------|--------|
| `POST /detect-change` | `{before_url, after_url, sector, gps_before, gps_after, accuracy_before, accuracy_after}` | `{change_type, change_metrics, confidence, diff_url}` |
| `POST /detect-change-video` | `{before_keyframes[], after_keyframes[], sector, ...}` | `{change_type, change_metrics, confidence, diff_url}` |
| `POST /classify-activity` | `{asset_url, sector}` | `{activity_type, phase, confidence, indicators}` |
| `POST /extract-signals` | `{asset_url, sector}` | `{vegetation_index, water_present, smoke, machinery[], ...}` |

---

## 8. ML Pipeline

### Models

| Model | Purpose | Training Data | Status |
|-------|---------|---------------|--------|
| **Sapling Detector (YOLOv8n)** | Count/locate saplings | ForestNet (1.2M patches) + 200 pilot | Trained (MVP) |
| **Change Detector (ChangeFormer)** | Before/after diff | LEVIR-CD (637 pairs) + 100 pilot | Trained (MVP) |
| **Base COCO YOLOv8n** | Person/machinery detection | COCO | Pre-trained (free) |

### ML Model Routing

Models are resolved from the `model_registry` table, not a hardcoded dict. A sector with no
trained model returns `unsupported` — it is never silently served by another sector's model.

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class ModelRef:
    key: str
    version: str
    sector: str


def resolve_model(model_key: str) -> ModelRef:
    row = registry.get(model_key)                      # model_registry lookup
    if row is None or row.status != "trained":
        # A wrong-sector number in a donor report is a credibility failure,
        # not a degraded experience. Refuse instead of falling back.
        raise UnsupportedSector(model_key, reason=row.status if row else "not_registered")
    return ModelRef(key=row.key, version=row.version, sector=row.sector)
```

Registry seed:

| key | sector | MVP status |
|-----|--------|------------|
| `forestry` | forestry | `trained` (placeholder — no weights exist yet) |
| `water` | water | `unsupported` |
| `infrastructure` | infrastructure | `unsupported` |
| `agriculture` | agriculture | `unsupported` |

`POST /detect-change` with an `unsupported` model returns
`{"status": "unsupported", "reason": "..."}` and a `change_events` row with
`status = 'failed'`. It never returns another sector's metrics.

### Video Processing (MVP)
1. **Capture** — 30s max, auto thumbnail, keyframe extraction (every 2s/scene change)
2. **Keyframe Extraction** — FFmpeg extracts I-frames + scene changes
3. **Alignment** — GPS rough alignment + ORB feature matching + homography warp
4. **Change Detection** — Run sapling detector on aligned keyframe pairs → aggregate metrics
5. **Diff Visualization** — First keyframe pair → red overlay diff → Cloudinary upload

---

## 9. Generative AI Policy

**Rule: Generative AI ONLY on derivative/report assets — NEVER on source evidence.**

| Category | Feature | Parameter | Use Case |
|----------|---------|-----------|----------|
| Privacy | Generative Remove | `e_gen_remove:prompt_person` | Remove people from reports |
| Privacy | Face Blur | `e_blur_faces` | Blur faces without altering the scene |
| Privacy | Remove Text | `e_gen_remove:prompt_text` | Strip text/logos |
| Quality | Auto Enhance | `e_auto_enhance`, `e_auto_contrast`, `e_improve` | Improve report visibility |
| Quality | Restore | `e_gen_restore` | Recover detail in degraded photos |
| Layout | Generative Expand | `b_gen_fill` with `ar_16:9,c_pad` | Report layouts (16:9, 4:3, 9:16) |
| Layout | Auto Crop | `c_lfill,g_auto,ar_16:9` | Smart crop, never upscales |
| Branding | Generative Recolor | `e_gen_recolor:prompt_<subject>;to-color_<hex>` | Brand consistency |
| Branding | Background Replace | `e_gen_background_replace` | Branded backgrounds |
| Accessibility | AI Captioning | *add-on API call* | Alt-text for reports |
| Multilingual | AI Translation | *add-on API call* | International donor reports |
| Analytics | Object Counting | **our CV model** | Report metrics |
| Analytics | Anomaly Detection | **our CV model** | Reviewer attention |
| Report Automation | AI Summarization | LLM on existing metrics | Executive summary |

**Guardrail:** All generative AI functions require `assertDerivativeAsset()` — source assets never modified.

**Not transformations:** captioning, translation, object counting, and anomaly detection. The first two are add-on API calls; the last two must come from our versioned CV model (FR-2 / `AGENTS.md` §3.2). Writing them into a delivery URL will fail.

**Async:** `b_gen_fill` and `e_gen_recolor` return **423 Locked** while generating. Register them as eager transformations at upload; do not `fetch()` synchronously.

---

## 10. Cloudinary Startup Kit (Hackathon)

**Apply:** https://cloudinary.com/pages/hackathons/

### Benefits

> ⚠️ Unverified. Confirm current terms on the application page before relying on any of this.

- Hackathon credits — amount and duration per the current program
- Generative AI transforms (Remove, Fill, Recolor, Replace, Restore)
- Video API (transcoding, streaming profiles, clip extraction)
- AI transforms as add-ons (auto-tagging, auto-enhance, background removal)
- Priority support during hackathon

### Quick Start
```bash
# 1. Apply at cloudinary.com/pages/hackathons/
# 2. Add to .env.local
CLOUDINARY_CLOUD_NAME=your_hackathon_cloud
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_UPLOAD_PRESET=verified_capture
```

---

## 11. Team Workstreams (3 People)

| Teammate | Focus | Key Deliverables |
|----------|-------|------------------|
| **A (Frontend)** | Dashboard, Capture App, UI Components, Shared Types | Dashboard, Capture App, UI Components |
| **B (Backend)** | Node API, Supabase/RLS, Cloudinary, BullMQ, Reports, Verification | API, Workers, Auth, Reports |
| **C (ML/Fullstack)** | Python ML Service, Model Training, Cloudinary ML Integration | ML Service, Models, Evaluation |

---

## 12. MVP Exit Criteria

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

## 12. File Map for AI Agent

```
cloudinary/
├── PRD.md                           # ← THIS FILE
├── ARCHITECTURE.md                  # System design doc
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

## 13. Acceptance Criteria for AI Agent

The AI agent must deliver:

1. **Monorepo** with Turborepo + pnpm workspaces
2. **4 services** (capture-app, dashboard, api, ml-service) + 2 packages (shared, ui-components)
3. **Capture App**: Expo + `expo-camera` v2 + `react-native-keychain` (Ed25519 in Secure Enclave)
4. **API**: Fastify + TypeScript + BullMQ + Supabase client + Cloudinary SDK
5. **ML Service**: FastAPI + PyTorch + YOLOv8 + ChangeFormer + video keyframe extraction
6. **Dashboard**: React 19 + Vite + TanStack Query + MapLibre GL + @cloudinary/react + @cloudinary/url-gen
6. **Database**: Supabase schema with RLS, PostGIS, audit hash chain
7. **CI/CD**: GitHub Actions for all 4 services + shared packages
8. **Tests**: Unit (80% API, 70% ML), Integration (Testcontainers), E2E (Playwright/Detox)
9. **CI/CD**: GitHub Actions for all 4 services + shared packages
10. **Documentation**: All docs in `/docs` folder

---

## 14. Definition of Done (Per Task)

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

*End of PRD*