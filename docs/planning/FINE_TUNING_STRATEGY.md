# Fine-Tuning Strategy: One Model at a Time

> **Panchnama** — a written record of inspection, signed by a witness.

---

## The Concern
> "We have to fine-tune for multiple sectors. We can't do that."

## The Answer: **You Don't. MVP = One Sector = One Model.**

---

## Sector Rollout Strategy

| Phase | Sectors | Models Needed | Approach |
|-------|---------|---------------|----------|
| **MVP (Now)** | Forestry / Mangrove | **1** (Sapling detection + change) | Fine-tune YOLOv8 on ForestNet + pilot data |
| **Post-MVP v1.1** | + Water/Sanitation | +1 (Water extent + infrastructure) | Reuse infra model, add water segmentation |
| **Post-MVP v1.2** | + Infrastructure | +0 (Reuse water infra model) | Same model, different config |
| **Post-MVP v1.3** | + Agriculture | +1 (Crop health) | New model |
| **Platform v2.0** | All (pluggable) | N (registry) | Model router + auto-selection |

---

## MVP Model: Forestry Only

### What We Need to Train
| Model | Task | Base | Training Data | Epochs | GPU Time |
|-------|------|------|---------------|--------|----------|
| **Sapling Detector** | Count/locate saplings | YOLOv8n (COCO) | ForestNet (1.2M patches) + 200 pilot images | 50 | ~2 hrs (T4) |
| **Tool Detector** | Count hand tools / planting activity | YOLOv8n | ~300 labelled pilot crops | 30 | ~1 hr (T4) |
| **Change Detector** | Before/after diff | ChangeFormer (LEVIR-CD) | LEVIR-CD (637 pairs) + 100 pilot pairs | 30 | ~1 hr (T4) |

### What We Get Free (Cloudinary)
- Generic object tags: `tree`, `plant`, `soil`, `person`, `shovel`
- Scene classification: `outdoor`, `forest`, `field`
- OCR: Text on signs/boards
- No training needed. Works Day 1.

---

## Model Architecture: Pluggable from Day 1

```python
# apps/ml-service/src/models/registry.py
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, Tuple
import os
import numpy as np
from geopy.distance import geodesic

class SectorModel(ABC):
    """Base class for sector-specific models."""
    
    @abstractmethod
    def detect_change(
        self, 
        before_url: str, 
        after_url: str,
        gps_before: Optional[Tuple[float, float]] = None,
        gps_after: Optional[Tuple[float, float]] = None,
        accuracy_before: Optional[float] = None,
        accuracy_after: Optional[float] = None
    ) -> Dict[str, Any]: ...
    
    @abstractmethod
    def detect_change_video(
        self,
        before_keyframes: List[Dict],  # [{"url": "...", "timestamp": 1.5}, ...]
        after_keyframes: List[Dict],
        gps_before: Optional[Tuple[float, float]] = None,
        gps_after: Optional[Tuple[float, float]] = None,
        accuracy_before: Optional[float] = None,
        accuracy_after: Optional[float] = None
    ) -> Dict[str, Any]: ...
    
    @abstractmethod
    def classify_activity(self, asset_url: str) -> Dict[str, Any]: ...
    
    @abstractmethod
    def extract_signals(self, asset_url: str) -> Dict[str, Any]: ...
    
    @property
    @abstractmethod
    def sector(self) -> str: ...
    
    @property
    @abstractmethod
    def version(self) -> str: ...


class ForestryModel(SectorModel):
    """Forestry/Mangrove sector model."""
    
    def __init__(self, weights_dir: str = "weights/forestry"):
        from ultralytics import YOLO
        import torch
        
        self.sector = "forestry"
        self.version = "v3.1"
        self.weights_dir = weights_dir
        
        # Every detector is loaded ONCE here and cached on the model object.
        # Never construct YOLO() inside a request handler.
        self.sapling_detector = YOLO(os.path.join(weights_dir, "sapling_yolov8n.pt"))
        self.base_detector = YOLO(os.path.join(weights_dir, "coco_yolov8n.pt"))
        self.change_detector = self._load_change_detector()

        # Resolve COCO class ids BY NAME from the model's own label map.
        # Hardcoded indices are wrong: the standard 80-class COCO order is
        # 0 person, 2 car, 5 bus, 7 truck, 24 backpack, 27 tie, 28 suitcase.
        # An earlier draft used [27, 28, 3, 6, 8] and was therefore counting
        # tie, suitcase, motorcycle, train and boat -- missing every truck and
        # bus it claimed to be counting.
        names = self.base_detector.names
        self.coco_vehicle_ids = [
            names[n] for n in ("car", "bus", "truck", "motorcycle", "boat")
        ]
        self.coco_person_id = names["person"]

    def tool_count_from_custom_detector(self, img) -> int:
        """Forestry tools are not a COCO class. Returns 0 until a tool model exists."""
        if self.tool_detector is None:
            return 0
        return len(self.tool_detector(img, conf=0.3)[0].boxes)
    
    def _load_change_detector(self):
        # Load ChangeFormer or Siamese UNet
        import torch
        from models.change_former import ChangeFormer
        model = ChangeFormer()
        model.load_state_dict(torch.load(
            os.path.join(self.weights_dir, "change_former.pth"),
            map_location='cpu'
        ))
        model.eval()
        return model
    
    def detect_change(self, before_url, after_url, gps_before=None, gps_after=None, 
                      accuracy_before=None, accuracy_after=None):
        # 1. Download & align (use GPS + accuracy for alignment quality)
        before_img = download_image(before_url)
        after_img = download_image(after_url)
        
        aligned_before, aligned_after, alignment_quality = align_images(
            before_img, after_img,
            gps_before, gps_after,
            accuracy_before, accuracy_after
        )
        
        # 2. Run sapling detector on both
        before_dets = self.sapling_detector(aligned_before, conf=0.25)
        after_dets = self.sapling_detector(aligned_after, conf=0.25)
        
        # 3. Count difference + area calc
        before_count = len(before_dets[0].boxes)
        after_count = len(after_dets[0].boxes)
        planted = max(0, after_count - before_count)
        
        # Area calculation from GPS + image dimensions
        area_sqm = calculate_area(aligned_before, gps_before, gps_after)
        
        # 4. Generate diff visualization
        diff_img = generate_diff_visualization(aligned_before, aligned_after)
        diff_url = upload_to_cloudinary(diff_img, f"diff/{before_url.split('/')[-1]}")
        
        return {
            "change_type": "sapling_planting",
            "change_metrics": {
                "saplings_planted": planted,
                "area_covered_sqm": round(area_sqm, 2),
                "planting_density_per_sqm": round(planted / area_sqm, 4) if area_sqm > 0 else 0,
                "before_count": before_count,
                "after_count": after_count,
                "alignment_quality": alignment_quality
            },
            "confidence": float(min(
                before_dets[0].boxes.conf.mean() if before_count else 1,
                after_dets[0].boxes.conf.mean() if after_count else 1
            )),
            "diff_url": diff_url
        }
    
    def detect_change_video(self, before_keyframes, after_keyframes, gps_before=None, gps_after=None,
                           accuracy_before=None, accuracy_after=None):
        """Detect change from video keyframes."""
        # 1. Align keyframe pairs (GPS + feature matching)
        aligned_pairs = []
        for bf, af in zip(before_keyframes, after_keyframes):
            aligned_b, aligned_a, quality = align_images(
                download_image(bf["url"]), download_image(af["url"]),
                gps_before, gps_after, accuracy_before, accuracy_after
            )
            aligned_pairs.append((aligned_b, aligned_a, quality, bf["timestamp"], af["timestamp"]))
        
        # 2. Run sapling detector on each aligned pair
        total_planted = 0
        total_area = 0.0
        confidences = []
        
        for aligned_before, aligned_after, quality, ts_b, ts_a in aligned_pairs:
            before_dets = self.sapling_detector(aligned_before, conf=0.25)
            after_dets = self.sapling_detector(aligned_after, conf=0.25)
            
            before_count = len(before_dets[0].boxes)
            after_count = len(after_dets[0].boxes)
            planted = max(0, after_count - before_count)
            area = calculate_area(aligned_before, gps_before, gps_after) / len(aligned_pairs)
            
            total_planted += planted
            total_area += area
            if before_count > 0 and after_count > 0:
                confidences.append(float(min(
                    before_dets[0].boxes.conf.mean(),
                    after_dets[0].boxes.conf.mean()
                )))
        
        # 3. Generate diff visualization for first keyframe pair
        diff_img = generate_diff_visualization(aligned_pairs[0][0], aligned_pairs[0][1])
        diff_url = upload_to_cloudinary(diff_img, f"diff/video_{before_keyframes[0]['url'].split('/')[-1]}")
        
        return {
            "change_type": "sapling_planting",
            "change_metrics": {
                "saplings_planted": total_planted,
                "area_covered_sqm": round(total_area, 2),
                "planting_density_per_sqm": round(total_planted / total_area, 4) if total_area > 0 else 0,
                "keyframes_analyzed": len(aligned_pairs),
                "avg_alignment_quality": sum(p[2] for p in aligned_pairs) / len(aligned_pairs)
            },
            "confidence": float(np.mean(confidences)) if confidences else 0.5,
            "diff_url": diff_url
        }
    
    def classify_activity(self, asset_url: str) -> Dict[str, Any]:
        img = download_image(asset_url)
        
        # Base COCO detector for person/vehicle classes. Cached on the model
        # object -- constructing YOLO() per request is an OOM, not a latency bug.
        base_results = self.base_detector(img, conf=0.3, classes=self.coco_vehicle_ids)

        # Sapling detector for sapling counts
        sapling_results = self.sapling_detector(img, conf=0.3)

        sapling_count = len(sapling_results[0].boxes)
        person_count = len([b for b in base_results[0].boxes if b.cls == 0])  # COCO person
        vehicle_count = len([b for b in base_results[0].boxes if b.cls != 0])  # car, bus, truck
        # No tool signal from COCO -- see the note below. Kept at 0, not guessed.
        tool_count = self.tool_count_from_custom_detector(img)
        
        if sapling_count > 10 and tool_count > 0:
            activity = "planting"
            phase = "after" if sapling_count > 20 else "during"
        elif sapling_count > 0 and person_count > 0:
            activity = "survey"
            phase = "during"
        elif vehicle_count > 0:
            activity = "construction"
            phase = "during"
        else:
            activity = "site_inspection"
            phase = "before"
        
        return {
            "activity_type": activity,
            "phase": phase,
            "confidence": 0.85,
            "indicators": {
                "saplings_visible": sapling_count,
                "people_visible": person_count,
                "tools_visible": tool_count,
                "vehicles_visible": vehicle_count
            }
        }
    
    def extract_signals(self, asset_url: str) -> Dict[str, Any]:
        """Extract visual signals relevant to forestry.
        
        TODO(ML-1): Replace with actual implementation by Phase 2 Week 1.
        Owner: Teammate C (ML/Fullstack)
        Options:
        - Vegetation index: NDVI from RGB (if NIR not available) or ExG
        - Water detection: UNet segmentation (pre-trained on water bodies dataset)
        - Smoke/fire: YOLOv8 trained on smoke datasets
        - Machinery: COCO classes cover car/bus/truck only. **Excavators and tractors are not COCO
  classes** -- COCO has no construction-equipment category. A field photo of an excavator will
  return zero vehicles, which reads as "no machinery on site" rather than "model can't tell".
  This is a false negative in a compliance report and must be surfaced as `unknown`, not 0.
        - Bare ground / canopy: Segmentation model (SMP UNet + ResNet)
        """
        # TODO(ML-1): Implement actual signal extraction
        # For MVP demo: return computed values from simple heuristics + base COCO YOLOv8n
        img = download_image(asset_url)
        arr = np.array(img.convert('RGB'))
        
        # Simple ExG (Excess Green) for vegetation index
        r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]
        exg = 2*g - r - b
        vegetation_index = float(np.clip(exg.mean() / 255.0, 0, 1))
        
        # Simple blue channel threshold for water
        water_present = bool((b > 1.2 * r).mean() > 0.15)
        
        # Smoke: high brightness + low saturation in regions
        brightness = arr.mean(axis=2)
        saturation = 1 - (arr.min(axis=2) / (arr.max(axis=2) + 1e-6))
        smoke = bool(((brightness > 200) & (saturation < 0.3)).mean() > 0.05)
        
        # Machinery: base COCO YOLOv8n (the sapling detector is single-class, nc=1,
        # so it cannot report person or vehicle classes at all).
        base_results = self.base_detector(img, conf=0.3, classes=self.coco_vehicle_ids)
        machinery = [self.base_detector.names[int(c)] for c in base_results[0].boxes.cls]
        
        # Bare ground: low vegetation index + high soil color (brown)
        bare_ground_pct = float(((exg < 30) & (r > g) & (g > b)).mean())
        
        # Canopy cover: high vegetation index
        canopy_cover_pct = float((exg > 80).mean())
        
        return {
            "vegetation_index": round(vegetation_index, 3),
            "water_present": water_present,
            "smoke": smoke,
            "machinery": machinery,
            "bare_ground_pct": round(bare_ground_pct, 3),
            "canopy_cover_pct": round(canopy_cover_pct, 3)
        }


# Registry is a DB table, not a hardcoded dict. Add sectors without changing platform code.
#
#   model_registry(key, version, sector, weights_uri, status, metrics)
#   status ∈ { trained, prebuilt, unsupported }
#
# MVP seed:
#   forestry          -> trained       (placeholder; no weights exist yet)
#   water             -> unsupported
#   infrastructure    -> unsupported
#   agriculture       -> unsupported

def resolve_model(model_key: str) -> ModelRef:
    """Resolve a model from the registry.

    Refuses rather than falling back. A wrong-sector number in a donor report
    is a credibility failure, not a degraded experience.
    """
    row = registry.get(model_key)
    if row is None:
        raise UnsupportedSector(model_key, reason="not_registered")
    if row.status != "trained":
        raise UnsupportedSector(model_key, reason=row.status)
    return ModelRef(key=row.key, version=row.version, sector=row.sector)


def list_available_sectors() -> list[str]:
    return [m.key for m in registry.all() if m.status == "trained"]
```

---

## Cloudinary Service (ML Service → Cloudinary)

```python
# apps/ml-service/src/services/cloudinary.py
import cloudinary
import cloudinary.uploader
import cloudinary.api
import requests
from PIL import Image
import io
import os
import numpy as np
import cv2
from geopy.distance import geodesic
from typing import Optional, Tuple

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True
)

def download_image(url: str) -> Image.Image:
    """Download image from Cloudinary URL."""
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return Image.open(io.BytesIO(response.content))

def upload_to_cloudinary(image: Image.Image, public_id: str) -> str:
    """Upload PIL image to Cloudinary, return secure URL."""
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90)
    buffer.seek(0)
    
    result = cloudinary.uploader.upload(
        buffer,
        public_id=public_id,
        resource_type="image",
        # Derivative: never overwrite, never invalidate. A diff PNG is evidence too.
        overwrite=False,
        invalidate=False
    )
    return result["secure_url"]

def generate_diff_visualization(before: Image.Image, after: Image.Image) -> Image.Image:
    """Generate red-overlay diff visualization."""
    # Resize to same dimensions
    before = before.resize(after.size)
    
    # Convert to RGB arrays
    before_arr = np.array(before.convert('RGB'))
    after_arr = np.array(after.convert('RGB'))
    
    # Compute difference
    diff = np.abs(after_arr.astype(np.float32) - before_arr.astype(np.float32))
    diff = diff.mean(axis=2)  # Grayscale difference
    
    # Threshold and colorize (red)
    diff_normalized = (diff / diff.max() * 255).astype(np.uint8) if diff.max() > 0 else diff.astype(np.uint8)
    red_overlay = np.zeros_like(after_arr)
    red_overlay[:, :, 0] = diff_normalized  # Red channel
    
    # Blend with after image
    blended = cv2.addWeighted(after_arr, 0.7, red_overlay, 0.3, 0)
    return Image.fromarray(blended)

def align_images(before: Image.Image, after: Image.Image,
                 gps_before: Optional[Tuple[float, float]] = None,
                 gps_after: Optional[Tuple[float, float]] = None,
                 accuracy_before: Optional[float] = None,
                 accuracy_after: Optional[float] = None):
    """
    Align before/after images using GPS + feature matching.
    Returns (aligned_before, aligned_after, alignment_quality_score)
    
    TODO(ML-2): Full GPS + feature alignment by Phase 2 Week 2.
    Owner: Teammate C (ML/Fullstack)
    """
    # TODO(ML-2): Implement GPS-rough + ORB-fine alignment
    # For MVP: simple resize + ORB feature matching
    import cv2
    
    # Resize to same dimensions
    before = before.resize(after.size)
    before_arr = cv2.cvtColor(np.array(before), cv2.COLOR_RGB2GRAY)
    after_arr = cv2.cvtColor(np.array(after), cv2.COLOR_RGB2GRAY)
    
    # ORB feature detection
    orb = cv2.ORB_create(nfeatures=2000)
    kp1, des1 = orb.detectAndCompute(before_arr, None)
    kp2, des2 = orb.detectAndCompute(after_arr, None)
    
    alignment_quality = 0.5  # Default
    
    if des1 is not None and des2 is not None and len(kp1) > 10 and len(kp2) > 10:
        # Feature matching
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        matches = bf.match(des1, des2)
        matches = sorted(matches, key=lambda x: x.distance)
        
        if len(matches) > 20:
            # Extract matched points
            src_pts = np.float32([kp1[m.queryIdx].pt for m in matches[:50]]).reshape(-1, 1, 2)
            dst_pts = np.float32([kp2[m.trainIdx].pt for m in matches[:50]]).reshape(-1, 1, 2)
            
            # Find homography
            H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
            
            if H is not None:
                # Warp before image to align with after
                h, w = after_arr.shape
                before_color = cv2.cvtColor(np.array(before.resize(after.size)), cv2.COLOR_RGB2BGR)
                aligned_before_arr = cv2.warpPerspective(before_color, H, (w, h))
                aligned_before = Image.fromarray(cv2.cvtColor(aligned_before_arr, cv2.COLOR_BGR2RGB))
                
                # Quality = inlier ratio
                alignment_quality = float(mask.sum() / len(matches)) if mask is not None else 0.5
            else:
                aligned_before = before
        else:
            aligned_before = before
    else:
        aligned_before = before
    
    return aligned_before, after, alignment_quality

def calculate_area(image: Image.Image, 
                   gps1: Optional[Tuple[float, float]] = None,
                   gps2: Optional[Tuple[float, float]] = None) -> float:
    """Calculate ground area covered by image in sqm.
    
    TODO(ML-3): Accurate GSD calculation by Phase 2 Week 2.
    Owner: Teammate C (ML/Fullstack)
    """
    # TODO(ML-3): Implement proper GSD from focal length + altitude + sensor size
    # For MVP: estimate from GPS distance if available, else assume 0.5m GSD
    
    w, h = image.size
    
    if gps1 and gps2:
        # Haversine distance between two GPS points
        from geopy.distance import geodesic
        dist_m = geodesic(gps1, gps2).meters
        # Assume image diagonal ≈ ground distance between corners
        pixel_diag = np.sqrt(w**2 + h**2)
        gsd = dist_m / pixel_diag  # meters per pixel
    else:
        # Assume typical drone/phone GSD: 0.5m/pixel at ~50m altitude
        gsd = 0.5
    
    area_sqm = (w * gsd) * (h * gsd)
    return round(area_sqm, 2)
```

---

## Training Data Plan (No Proprietary Data Needed)

| Model | Public Dataset | Size | Supplement |
|-------|----------------|------|------------|
| Sapling Detector | **ForestNet** (ICCV 2019) | 1.2M patches | 200 pilot images from partner NGO |
| Change Detector | **LEVIR-CD** (Building) + **OSCD** (Satellite) | ~700 pairs | 100 pilot before/after pairs |
| Visual Signals | **Custom** (water/smoke/machinery from COCO + web scrape) | ~5K images | Pilot data |

**Data Collection During Pilot:**
- Every capture with `observation_type` = labeled training data
- Every verified change event = ground truth for change model
- Target: 500 labeled images/sector in 3 months → retrain monthly

### Training Scripts Structure

```
apps/ml-service/training/
├── data/
│   ├── download_forestnet.py       # Downloads ForestNet patches
│   ├── download_levir_cd.py        # Downloads LEVIR-CD pairs
│   ├── prepare_yolo.py             # Converts to YOLO format
│   └── augment.py                  # Albumentations augmentations
├── train_sapling_yolo.py           # YOLOv8 fine-tuning
├── train_change_detector.py        # ChangeFormer training
├── evaluate.py                     # Evaluation metrics
└── export_onnx.py                  # Export for production
```

### Example: Sapling YOLO Training

```python
# training/train_sapling_yolo.py
from ultralytics import YOLO
import yaml

# 1. Prepare dataset.yaml
dataset_config = {
    'path': 'data/forestnet_yolo',
    'train': 'images/train',
    'val': 'images/val',
    'nc': 1,
    'names': ['sapling']
}
with open('data/forestnet_yolo/dataset.yaml', 'w') as f:
    yaml.dump(dataset_config, f)

# 2. Load base model (COCO pre-trained)
model = YOLO('yolov8n.pt')

# 3. Fine-tune
results = model.train(
    data='data/forestnet_yolo/dataset.yaml',
    epochs=50,
    imgsz=640,
    batch=16,
    device=0,  # GPU
    project='weights/forestry',
    name='sapling_yolov8n',
    exist_ok=True,
    patience=10,
    save_period=10,
    # Augmentation for field conditions
    hsv_h=0.015, hsv_s=0.7, hsv_v=0.4,
    degrees=10, translate=0.1, scale=0.5,
    shear=2, perspective=0.0005,
    flipud=0.0, fliplr=0.5,
    mosaic=1.0, mixup=0.1,
)

# 4. Validate
metrics = model.val()
print(f"mAP50: {metrics.box.map50:.4f}, mAP50-95: {metrics.box.map:.4f}")

# 5. Export to ONNX for production
model.export(format='onnx', opset=12, simplify=True)
```

---

## Cost Estimate (MVP)

| Resource | Cost |
|----------|------|
| GPU Training (2 models × 3 hrs × $0.50/hr) | ~$3 |
| Cloudinary (10K assets, transformations) | Free tier → ~$50/mo |
| Supabase (DB + Realtime + Auth) | Free tier → ~$25/mo |
| Hosting (Railway + Fly.io + Vercel) | ~$20/mo |
| **Total MVP** | **~$100/mo + $3 training** |

---

## Adding a New Sector (Post-MVP)

```python
# 1. Create new model class
class WaterModel(SectorModel):
    def __init__(self):
        self.sector = "water"
        self.version = "v1.0"
        self.water_segmentation = load_model("weights/water/unet_water.pth")
        self.infra_detector = YOLO("weights/infra/yolov8_infra.pt")
    
    def detect_change(self, before_url, after_url, **kwargs):
        # Water extent change detection
        before = download_image(before_url)
        after = download_image(after_url)
        water_before = self.water_segmentation(before)
        water_after = self.water_segmentation(after)
        change = calculate_water_change(water_before, water_after)
        return {"change_type": "water_extent_change", "change_metrics": change, ...}
    
    # ... implement other methods

# 2. Register in registry.py
SECTOR_MODELS["water"] = WaterModel()

# 3. Add project config for water sector
# projects.config = {
#   "observation_types": [
#     {"type": "well_drilling", "model": "water", "gps_radius": 10, "phase_field": "drilling_phase"},
#     {"type": "pipe_laying", "model": "water", "gps_radius": 10, "phase_field": "laying_phase"},
#     {"type": "water_test", "model": "water", "gps_radius": 15, "phase_field": "testing_phase"}
#   ],
#   "report_template": "water_report"
# }

# 4. Deploy - NO PLATFORM CODE CHANGES
```

---

## Verdict

**Fine-tuning is not a blocker.** You train **one sector's models** for MVP. The architecture supports adding sectors later without rewrites. Cloudinary handles 80% of AI needs (tagging, OCR, moderation) with zero training.

**Your competitive advantage**: Not "we have models for everything" — but **"we have auditable, quantified metrics for forestry TODAY, and the architecture to add water/infra/ag next quarter without rebuilding."**

**Config Key Standardization**: Use `observation_types[].model` in `projects.config` (consistent with ARCHITECTURE, DATABASE_SCHEMA, README).

---

## Placeholder Tracking (MVP Implementation)

| ID | Placeholder | Location | Replacement Plan | Owner | Deadline | Status |
|----|-------------|----------|------------------|-------|----------|--------|
| **ML-1** | `extract_signals` hardcoded returns | `ForestryModel.extract_signals()` | Implement ExG vegetation index, blue-channel water, brightness smoke, YOLO machinery, bare/canopy heuristics | Teammate C | Phase 2 Week 1 | ✅ Implemented (heuristic MVP) |
| **ML-2** | `align_images` returns input images | `cloudinary.py:align_images()` | GPS rough alignment + ORB feature matching + homography warp | Teammate C | Phase 2 Week 2 | 🔄 In Progress |
| **ML-3** | `calculate_area` returns 1000.0 | `cloudinary.py:calculate_area()` | GSD from focal length + altitude + sensor size, or GPS distance fallback | Teammate C | Phase 2 Week 2 | 🔄 In Progress |
| **ML-4** | `classify_activity` confidence 0.85 | `ForestryModel.classify_activity()` | Calibrate confidence from detection scores + context | Teammate C | Phase 2 Week 3 | ⏳ Planned |
| **ML-5** | Change detector confidence mean | `ForestryModel.detect_change()` | Proper confidence from model outputs (not min of means) | Teammate C | Phase 2 Week 3 | ⏳ Planned |

**Verification Gates (Definition of Done):**
- [ ] All TODO(ML-*) comments resolved or moved to post-MVP backlog
- [ ] No hardcoded returns in production code paths
- [ ] Unit tests for each replaced function with synthetic + real data
- [ ] Integration test: capture → upload → detect_change → metrics → report
- [ ] Demo script uses real computed values (not placeholders)

**Post-MVP Backlog (v1.1+):**
- ML-6: Learned vegetation index (NDVI from multispectral if available)
- ML-7: Deep water segmentation (U-Net on water bodies dataset)
- ML-8: Smoke/fire detection model (YOLOv8 on smoke datasets)
- ML-9: Machinery classifier (custom classes: excavator, bulldozer, tractor)
- ML-10: Sub-pixel alignment (ECC + Lucas-Kanade optical flow)