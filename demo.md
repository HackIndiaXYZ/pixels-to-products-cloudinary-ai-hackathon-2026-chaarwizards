# Impact Media Intelligence Platform — Demo Recording Runbook

**Project**: Cloudinary Hackathon — AI Media Intelligence Platform
**Record by**: Tomorrow
**Last updated**: 2026-09-30

---

## 🎯 Demo Narrative (90–120 seconds) — **TWO MODELS**

1. **Dashboard** — Org admin logs in, sees **two projects**: "Mangrove Restoration" (forestry) + "Wetland Monitoring" (water)
2. **Capture App** — Field worker selects **forestry project**, captures geo-tagged mangrove photo → uploads
3. **Dashboard** — Asset appears with integrity chain, EXIF verification, GPS accuracy
4. **Change Detection (Forestry)** — Capture second "after" photo → pair → ML runs → **sapling count + change mask**
5. **Switch to Water Project** — "Wetland Monitoring" → capture water body photo
6. **Change Detection (Water)** → **water extent + flood/drought change mask**
7. **Reports** — Generate audit-ready PDFs for both sectors with integrity appendix

---

## ✅ What's Live Right Now (Cloud)

| Component | Status | Access |
|---|---|---|
| **Supabase** | Cloud project `uypmapvrttnkjnzjlotj` — all 20 migrations applied, custom access token hook **enabled** | JWT has top-level `org_id` + `app_role` |
| **API** | Running on `:8080` (detached `setsid nohup`) | `http://127.0.0.1:8080/health` ✓ |
| **ML Service** | Running on `:8100` (detached) | `http://127.0.0.1:8100/health` ✓, internal JWT auth works |
| **Redis** | Docker container `impact-redis` | `6379` listening |
| **Dashboard** | Points at **cloud** Supabase, real Cloudinary `o2ystfbm` | `VITE_SUPABASE_URL=https://...`, `VITE_CLOUDINARY_CLOUD_NAME=o2ystfbm` |
| **Capture App** | Real Cloudinary creds + API URL + demo org ID | `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=o2ystfbm`, `EXPO_PUBLIC_API_URL=http://127.0.0.1:8080` |
| **Demo Org** | `Demo Conservation NGO` (ngo) — `137cb278-8f28-46fc-b005-8494a4628b48` | |
| **Forestry Project** | `Mangrove Restoration — Sundarbans` — `11a5342c-1e87-4282-b97d-c15398ca6487` | Sector `forestry`, observation `mangrove_planting` |
| **Water Project** | `Wetland Monitoring — Sundarbans` — (create via API below) | Sector `water`, observation `water_extent` |

**Demo credentials (all `Demo1234!Easy`):**

| Role | Email | Org ID | Use for |
|---|---|---|---|
| `platform_admin` | `admin@demo.local` | bootstrap org `f59d6984` | Provision orgs, global access |
| `org_admin` | `orgadmin@demo.local` | demo org `137cb278` | Create projects, manage assets, generate reports |

---

## 🎬 Recording Steps — Terminal Commands

### 1. Start Dashboard (React 19 + Vite)
```bash
cd /home/kartik/Hackathons/cloudinary/apps/dashboard && pnpm dev
# → Opens http://127.0.0.1:5173
#   Log in as orgadmin@demo.local / Demo1234!Easy
#   You'll see: the demo org, TWO projects (forestry + water)
```

### 2. Create Water Project (one-time, via API)
```bash
TOKEN="<paste-access-token-from-dashboard-localStorage>"
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "name": "Wetland Monitoring — Sundarbans",
    "sector": "water",
    "start_date": "2026-01-15",
    "config": {
      "observation_types": [
        { "type": "water_extent", "label": "Water extent", "model": "water", "gps_radius": 100 }
      ],
      "report_template": "default"
    }
  }' \
  http://127.0.0.1:8080/v1/projects
# → Returns project_id for water project
```

### 3. Start Capture App (Expo — needs **dev build**, not Expo Go)
```bash
cd /home/kartik/Hackathons/cloudinary/apps/capture-app

# If dev client NOT built yet (one-time, 5–15 min):
pnpm expo:prebuild && pnpm ios   # or pnpm android

# Then start the dev server:
pnpm start   # expo start --dev-client
# → Scan QR with dev client on device/emulator
#   Project list shows BOTH "Mangrove Restoration" and "Wetland Monitoring"
#   Select project → capture photo → uploads → appears in dashboard
```

### 4. Demo Flow — Forestry (Mangrove)
```
Dashboard → Assets → [Mangrove photo 1] → wait for webhook
Capture App → Select "Mangrove Restoration" → Photo 2 ("after")
Dashboard → Pairs → Auto-pair → Detect Change → Shows:
  - Sapling count: N
  - Change mask overlay (red = loss, green = gain)
  - Confidence scores
```

### 5. Demo Flow — Water (Wetland)
```
Dashboard → Switch project to "Wetland Monitoring"
Capture App → Select "Wetland Monitoring" → Photo 1 (water body)
Dashboard → Assets → [Water photo 1]
Capture App → Photo 2 ("after" — flood/drought simulation)
Dashboard → Pairs → Detect Change → Shows:
  - Water body count / extent (hectares)
  - Change mask (blue = new water, brown = lost water)
  - Confidence scores
```

### 6. Generate Reports
```bash
# Forestry report
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"project_id":"11a5342c-1e87-4282-b97d-c15398ca6487"}' \
  http://127.0.0.1:8080/v1/reports/generate

# Water report (use water project_id from step 2)
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"project_id":"<water-project-id>"}' \
  http://127.0.0.1:8080/v1/reports/generate
```

---

## 🧪 Phase 6.5 — Training Real Models (Post-Demo)

### Forestry → **Google Colab** (GPU: T4)
```bash
# 1. Open in Colab: apps/ml-service/training/colab_forestry_training.ipynb
# 2. Set REPO_URL to your GitHub fork
# 3. Run all cells sequentially:
#    - Bootstrap (mounts Drive, clones repo)
#    - Install requirements (Colab has torch+CUDA)
#    - Download ForestNet + LEVIR-CD
#    - Prepare YOLO format
#    - Train YOLOv8n sapling (~2 hrs)
#    - Train ChangeFormer (~1 hr)
#    - Evaluate → eval/forestry_eval_v1.0.json
#    - Upload weights/ to private bucket (s3://impact-weights/forestry/v1.0/)
#    - Promote registry: python -m training.scripts.promote_model forestry --version v1.0
```

### Water → **Kaggle** (GPU: T4×2)
```bash
# 1. Open in Kaggle: apps/ml-service/training/kaggle_water_training.ipynb
# 2. Set REPO_URL to your GitHub fork
# 3. Enable Internet + GPU (T4×2) in Settings
# 4. Run all cells:
#    - Setup (clones repo)
#    - Install requirements (Kaggle has torch+CUDA)
#    - Download S1S2-Water via HF mirror (use subset for speed)
#    - Prepare YOLO format
#    - Train YOLOv8n water (~2 hrs on T4×2)
#    - Train ChangeFormer water (~1 hr)
#    - Evaluate → eval/water_eval_v1.0.json
#    - Upload weights/ to private bucket (s3://impact-weights/water/v1.0/s1s2_water/)
#    - Promote registry: python -m training.scripts.promote_model water --version v1.0 --source s1s2_water
```

### After Promotion — Verify Live
```bash
# Check model-info endpoint
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8100/model-info?key=forestry
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8100/model-info?key=water

# Should return: { "key": "forestry", "version": "v1.0", "status": "trained", "metrics": {...} }
# NOT: { "status": "unsupported" } or version "v1-placeholder"
```

---

## ⚠️ Known Gaps for Tomorrow's Demo

| Gap | Impact | Workaround |
|---|---|---|
| **Capture app not built** | Must run `pnpm expo:prebuild && pnpm ios/android` locally | Build tonight; dev client required |
| **No real assets yet** | Dashboard empty until first capture | First capture upload → webhook → asset row |
| **Models are placeholder baselines** | Forestry = HSV green-blob counting; Water = HSV blue-blob counting | This is **honest and deterministic** per AGENTS.md §3.3 — metrics are real CV output, not LLM guesses |
| **Water project not created yet** | Run the API call in Step 2 above | Takes 5 seconds |
| **Dashboard env caching** | Vite inlines `VITE_*` at build time | `pnpm dev` re-reads `.env.local` on restart |

---

## 🔧 If Anything Breaks

| Symptom | Check / Fix |
|---|---|
| Dashboard shows 0 projects | Restart `pnpm dev` in dashboard |
| Capture app 401 on upload | Cloudinary preset `verified_capture` must be **Unsigned**, folder `evidence`, resource_type `image` + `video` |
| ML calls 401 | `INTERNAL_JWT_SECRET` byte-identical in API + ML (verified) |
| RLS denies data | Custom access token hook enabled on cloud (verified) |
| Water model returns `unsupported` | `model_registry` water row must have `status='trained'` + `weights_uri` set — currently it's `v0`/`unsupported` (placeholder) |

---

## 📦 Phase 6.5 Scaffold — Files Created

```
apps/ml-service/training/
├── config.py                    # Single source of truth for all hyperparams
├── requirements_colab.txt       # Colab deps (ultralytics, albumentations, etc.)
├── requirements_kaggle.txt      # Kaggle deps
├── data/
│   ├── download_datasets.py     # ForestNet, LEVIR-CD, S1S2-Water, GLH, ATLANTIS
│   ├── prepare_yolo.py          # Raw → YOLO layout (nc=1, names=['sapling'|'water'])
│   └── augment.py               # Albumentations pipelines (sector-specific)
├── models/
│   ├── water.py                 # Learned water model (YOLO + ChangeFormer + COCO context)
│   └── synthetic_water.py       # Deterministic water baseline (NDWI + grayscale diff)
├── scripts/
│   ├── colab_bootstrap.py       # Auto-detect Colab/Kaggle/local + setup
│   ├── train_yolo.py            # YOLOv8n training (forestry/water)
│   ├── train_change.py          # ChangeFormer training (forestry/water)
│   ├── evaluate.py              # mAP / IoU / F1 evaluation → JSON
│   ├── export_onnx.py           # ONNX export for production
│   └── promote_model.py         # Flips model_registry (needs live DB creds)
├── colab_forestry_training.ipynb   # Ready-to-run Colab notebook
└── kaggle_water_training.ipynb     # Ready-to-run Kaggle notebook
```

**Registry update** (`src/registry.py:97`): `default_factory` now routes by `row.key`:
- `forestry` → `YoloForestryModel` / `SyntheticForestryModel`
- `water` → `YoloWaterModel` / `SyntheticWaterModel`

---

## 🚀 TL;DR for Tomorrow

1. **Dashboard**: `cd apps/dashboard && pnpm dev` → login `orgadmin@demo.local`
2. **Create water project**: `curl POST /v1/projects` with sector=water (see Step 2 above)
3. **Capture app**: Build dev client → capture forestry → capture water
4. **Show both change detections** → generate both reports
5. **Post-demo**: Run Colab (forestry) + Kaggle (water) → promote → real weights

All services already running (API:8080, ML:8100, Redis:6379). The only local build needed is the Expo dev client.