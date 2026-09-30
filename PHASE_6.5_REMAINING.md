# Phase 6.5 — Remaining Issues & TODO List

> Status: All lint (ruff), typecheck (mypy), and tests (pytest) pass. Scaffolding is complete and committed on branch `phase/6.5`.

---

## ✅ DONE — Scaffolding Complete

| Area | Files | Status |
|---|---|---|
| **Water learned model** | `src/models/water.py` | ✅ |
| **Water synthetic baseline** | `src/models/synthetic_water.py` | ✅ |
| **Registry routing** | `src/registry.py` | ✅ |
| **Training config** | `training/config.py` | ✅ |
| **Dataset downloads** | `training/data/download_datasets.py` | ✅ |
| **YOLO prep** | `training/data/prepare_yolo.py` | ✅ |
| **Augmentations** | `training/data/augment.py` | ✅ |
| **YOLO training** | `training/scripts/train_yolo.py` | ✅ |
| **ChangeFormer training** | `training/scripts/train_change.py` | ✅ |
| **Evaluation** | `training/scripts/evaluate.py` | ✅ |
| **ONNX export** | `training/scripts/export_onnx.py` | ✅ |
| **Registry promotion** | `training/scripts/promote_model.py` | ✅ |
| **Colab bootstrap** | `training/scripts/colab_bootstrap.py` | ✅ |
| **Colab notebook** | `training/colab_forestry_training.ipynb` | ✅ |
| **Kaggle notebook** | `training/kaggle_water_training.ipynb` | ✅ |
| **Requirements** | `requirements_colab.txt`, `requirements_kaggle.txt` | ✅ |

---

## 🔴 MUST DO — Before Training (User Action Required)

| Task | Where | Effort | Notes |
|------|-------|--------|-------|
| **Set `REPO_URL`** in both notebooks | `colab_forestry_training.ipynb` (line 31), `kaggle_water_training.ipynb` (line 31) | 1 min | Replace `YOUR_ORG/impact-platform.git` with your GitHub fork |
| **Enable GPU + Internet** in Kaggle | Kaggle UI → Settings → Accelerator: GPU T4×2, Internet: ON | 1 min | Required for Hugging Face downloads |
| **Mount Google Drive** in Colab | Colab UI → Runtime → Change runtime type → GPU: T4 | 1 min | First cell handles mount |
| **Upload weights to private bucket** after training | S3 / GCS / your bucket | Manual | Paths: `s3://impact-weights/forestry/v1.0/`, `s3://impact-weights/water/v1.0/s1s2_water/` |
| **Run `promote_model.py`** after upload | Local with secrets | 1 min | `python -m training.scripts.promote_model forestry --version v1.0` etc. |

---

## 🟡 SHOULD DO — Before Production (Post-Demo)

| Task | Files | Effort | Blockers |
|------|-------|--------|----------|
| **Implement real ChangeFormer architecture** | `training/scripts/train_change.py`, `src/models/forestry.py`, `src/models/water.py` | Medium | Current code uses placeholder skeleton |
| **Implement actual dataset parsing** | `training/data/prepare_yolo.py` (`prepare_forestry`, `prepare_water`) | Medium | Depends on actual dataset folder structure |
| **Add tests for new models** | `tests/models/` (new) | Medium | `synthetic_water.py`, `water.py` have 0% coverage |
| **Add integration test for registry promotion** | `tests/training/test_promote_model.py` | Low | Requires test Supabase instance |
| **Fix notebook E402 (import order) warnings** | Both notebooks | Low | Ruff auto-fix handles most; remaining are style |

---

## 🟢 NICE TO HAVE — Future Enhancements

| Idea | Files | Notes |
|------|-------|-------|
| **Weights & Biases integration** | `train_yolo.py`, `train_change.py` | Add `wandb.init()` calls |
| **ONNX export for ChangeFormer** | `export_onnx.py` | Requires real ChangeFormer class |
| **Multi-GPU training (DDP)** | `train_yolo.py`, `train_change.py` | Add `torch.distributed` |
| **Model versioning in MLflow** | `promote_model.py` | Track `version`, `metrics`, `weights_uri` |
| **Automated dataset validation** | `prepare_yolo.py` | Verify image/label counts, class balance |
| **Synthetic baseline tests** | `tests/models/test_synthetic_water.py` | Assert determinism, output shapes |

---

## 📋 Training Checklist (Copy-Paste for Colab/Kaggle)

### Forestry → Colab
```
☐ 1. Open colab_forestry_training.ipynb
☐ 2. Set REPO_URL to your GitHub fork
☐ 3. Runtime → GPU T4
☐ 4. Run all cells sequentially
☐ 5. Verify weights/sapling_yolov8n.pt & weights/changeformer.pt exist
☐ 6. Upload weights/ to s3://impact-weights/forestry/v1.0/
☐ 7. python -m training.scripts.promote_model forestry --version v1.0
☐ 8. Verify: curl /model-info?key=forestry → returns v1.0, status=trained
```

### Water → Kaggle
```
☐ 1. Open kaggle_water_training.ipynb
☐ 2. Set REPO_URL to your GitHub fork
☐ 3. Settings → GPU T4×2 + Internet ON
☐ 4. Run all cells sequentially
☐ 5. Verify weights/water_yolov8n.pt & weights/changeformer_water.pt exist
☐ 6. Upload weights/ to s3://impact-weights/water/v1.0/s1s2_water/
☐ 7. python -m training.scripts.promote_model water --version v1.0 --source s1s2_water
☐ 8. Verify: curl /model-info?key=water → returns v1.0, status=trained
```

---

## 🔍 Known Gaps for Demo Tomorrow (Not Blocking)

| Gap | Impact | Workaround |
|-----|--------|------------|
| **Capture app dev build not done** | Can't capture on phone | Build tonight: `pnpm expo:prebuild && pnpm ios` |
| **Water project not created** | Dashboard shows only forestry | Run API call in demo.md Step 2 |
| **Models are synthetic baselines** | Metrics are HSV-blob counting | Honest placeholder per AGENTS.md §3.3 |
| **No real weights yet** | Production accuracy unknown | Training happens post-demo |

---

## 📦 Files to Commit Before Next Phase

Run `git status --porcelain` — should only show:
- `brag/` (ignored)
- `docs/diagrams/` (ignored)

All Phase 6.5 code is committed on `phase/6.5`.

---

## 🚀 Next Phase (Phase 7+)

Once training is done and promoted:
1. Verify `/model-info` returns real versions
2. Run end-to-end change detection on real assets
3. Generate reports with real metrics
4. Phase 7: Pairing & change events (already implemented on `phase/7`)
5. Phase 8: Dashboard E2E
6. Phase 9: Report templates
7. Phase 10: Integrity viewer
8. Phase 11: Hardening + MVP exit criteria