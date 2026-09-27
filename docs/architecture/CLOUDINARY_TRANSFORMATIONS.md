# Cloudinary Transformations — Verified Reference

**Verified:** 2026-09-26 against `cloudinary.com/documentation/transformation_reference*`
**Method:** HTTP status check on each official reference page + cross-check against Cloudinary's own alphabetical enumeration of `e_` effects.

**Status legend:** ✅ HTTP 200 on the official reference page · ⚠️ real but not confirmed in this pass · ❌ **does not exist**

---

## 1. Verified Real

### Resize and crop
| Param | Status | Use |
|-------|--------|-----|
| `c_fill` | ✅ | Crop to fill exact dimensions. Hard crop — cuts the edges. |
| `c_lfill` | ✅ | **Limit fill.** Fills the frame but never upscales; letterboxes if the aspect differs. Best default for evidence. |
| `c_limit` | ✅ | Downscale only, never upscale, preserve aspect. Full-width report images. |
| `c_scale` | ✅ | Straight resize, no crop. |
| `c_pad` | ✅ | Pad to target dims. **Required with `b_gen_fill`** for generative expansion. |
| `c_mpad`, `c_lpad` | ✅ | Directional pad. Also valid with `b_gen_fill`. |
| `c_fill_pad`, `c_auto_pad` | ✅ | Attempts the crop, then adds padding if the algorithm decides more of the original is needed. Avoids a "bad crop". `g_auto` required, no animated images. |
| `c_thumb` | ✅ | Tight crop around the gravity focal point, then scale. |
| `c_auto` | ✅ | Content-aware auto crop. **Requires `g_auto` plus two of `w_`/`h_`/`ar_`.** Smarter about what to keep than `c_fill`. **Up- and down-scales to the requested size.** |
| `g_auto` | ✅ | AI saliency/subject gravity. Qualifiers: `:faces` (default), `:subject`, `:classic`, `:ocr_text`, `:thirds_0`. |
| `ar_16:9` | ✅ | Aspect ratio. |
| `w_`, `h_` | ✅ | Target dimensions. |

**`c_auto` is real, but do not use it for evidence thumbnails.** Two reasons:

1. **It upscales.** If the requested size exceeds the original, `c_auto` scales up and invents
   pixels. `c_limit` and `c_lfill` never do. Delivering an upscaled "field photo" in an audit
   report implies detail that was never captured.
2. **A "bad crop" is a correctness bug here, not an aesthetic one.** `c_fill` will happily cut the
   subject, the plot boundary, or the sapling being counted straight out of the frame. For this
   domain the safer default is `c_lfill` — keep the whole frame, letterbox if needed.

Crop decision, per surface:

| Surface | Mode | Why |
|---|---|---|
| Report thumbnail | `c_lfill,g_auto` | Never upscales, keeps the whole frame, saliency-centred |
| Social / vertical | `c_fill_pad,g_auto` | Fills 1080×1350 but pads rather than cuts the evidence out |
| Full-width report image | `c_limit` | No crop, no upscale, no information lost |
| Fluid / detail | `c_limit,w_auto` | Original proportions preserved |

> **`g_auto` is AI-based, so it is not guaranteed stable across Cloudinary model versions.** A
> future saliency update could change which region of a photo a thumbnail centres on, and the
> same `transformation` string would then yield different bytes. This is safe here *because*
> report media is materialized and its `sha256` frozen into `report_manifest_entries` at
> generation time. Do not rely on re-rendering a transformation string to reproduce an archived
> report — re-fetch the derivative and compare hashes, exactly as the manifest is designed for.

### Optimization (apply to every derivative)
| Param | Status | Use |
|-------|--------|-----|
| `f_auto` | ✅ | Best format by request context. |
| `q_auto` | ✅ | Auto quality. Valid values confirmed: `q_auto:low`, `q_auto:good`, `q_auto:eco`, `q_auto:best`. |

### Responsive delivery
| Param | Status | Use |
|-------|--------|-----|
| `w_auto` | ✅ | Width from the requesting viewport. Grid thumbnails without shipping desktop pixels to a phone. |
| `dpr_auto` | ✅ | Density from the request. Avoids a 3× file on a 1× screen. |

Use `w_auto` on the dashboard media grid **with `c_limit`**, not `c_fill` — a fluid grid should not
crop unpredictably. Fixed-ratio surfaces (cards, social) keep explicit `w_`/`h_` + `c_lfill,g_auto`.
Pair with `<picture>` and `sizes` so the browser picks the candidate. Do not combine `w_auto`
with a hard `w_` in the same string; `w_` wins and `w_auto` is silently ignored.

### Generative AI
| Param | Status | Use |
|-------|--------|-----|
| `b_gen_fill` | ✅ | **Generative expand.** Note: this is a `b_` background qualifier, **not** an `e_` effect. Pairs with a pad crop. |
| `e_gen_remove` | ✅ | Remove objects, text, or explicit regions. |
| `e_gen_recolor` | ✅ | Recolor described elements. |
| `e_gen_replace` | ✅ | Replace described content. |
| `e_gen_restore` | ✅ | Restore detail in degraded images. |
| `e_gen_background_replace` | ✅ | Swap the background. |

### Image AI
| Param | Status | Use |
|-------|--------|-----|
| `e_auto_enhance` | ✅ | Automatic AI enhancement. |
| `e_auto_contrast` | ✅ | Automatic contrast. |
| `e_enhance` | ✅ | AI appeal adjustment. |
| `e_improve` | ✅ | Colour, contrast, brightness. |
| `e_contrast` | ✅ | Manual contrast. |

### Video
| Param | Status | Use |
|-------|--------|-----|
| `so_` | ✅ | Start offset. |
| `eo_` | ✅ | End offset. |
| `du_` | ✅ | Duration. |
| `sp_` | ✅ | Streaming profile (`sp_auto`). |

### Layers
| Param | Status | Use |
|-------|--------|-----|
| `l_` | ✅ | Overlay a layer (image, video, text, subtitles). |
| `fl_layer_apply` | ✅ | Closes a layer definition. Required. |
| `e_multiply`, `e_overlay`, `e_screen`, `e_anti_removal` | ✅ | Layer blend modes. **There is no `difference` blend mode.** |

---

## 2. Does Not Exist — Removed From The Design

| Wrong param | Status | Correct approach |
|-------------|--------|------------------|
| `e_diff` | ❌ | **No such effect, and no difference blend mode exists.** The diff must be rendered by the ML service and uploaded as its own derivative. See §3. |
| `e_gen_expand` | ❌ | Use `b_gen_fill` with a pad crop: `ar_16:9,c_pad,b_gen_fill`. |
| `e_gen_caption` | ❌ | Not a delivery transform. Captioning is an add-on **API** operation, not a URL param. |
| `e_gen_translate` | ❌ | Same as above — add-on API, not a URL param. |
| `e_gen_count` | ❌ | Object counts must come from our CV model. A transform cannot count reliably, and `AGENTS.md` §3.2 requires metrics from a versioned model anyway. |
| `e_gen_anomaly` | ❌ | Same — anomaly scores belong to our model, not a URL param. |
| `e_super_resolution` | ❌ | Not a Cloudinary transform. If wanted, implement in the ML service. |
| `e_style_transfer` | ❌ | Not a Cloudinary transform. Use `e_enhance` for mild grading. |
| `fl_spr` | ❌ | Not in the transformation reference. Use verified `so_`/`eo_`/`du_` keyframe clip extraction instead. |

---

## 3. Before/After Diff — The Correct Design

There is no Cloudinary effect that computes a pixel difference. The pipeline is:

```
ML service                          Cloudinary
──────────                          ──────────
1. Align before/after (ORB + homography)
2. Run ChangeFormer → binary change mask
3. Render mask as a red-overlay PNG locally
4. Upload PNG ────────────────────▶  public_id: {org}/{project}/diff/{change_event_id}
5. Store in change_events.diff_asset_id
```

`report_diff` is therefore **only a normalization resize** of our already-rendered diff PNG — not a comparison operation:

```
c_limit,w_1600/q_auto:eco/f_auto
```

The `l_` + `fl_layer_apply` layer syntax is still used elsewhere in the project (watermarks, logos, text overlays on report images) and is verified.

---

## 4. Critical Implementation Gotcha: 420 / 423

Generative transformations are **asynchronous**. From Cloudinary's docs:

| Code | Meaning |
|------|---------|
| **423 Locked** | The derived asset is still being generated. Returned when *fetching* a generative transform. |
| **420 Pending** | The asset is still being generated. Returned with status `pending` for an *incoming transformation*. |

**Implications:**
- Never `fetch()` a `b_gen_fill` or `e_gen_recolor` URL synchronously inside a request handler. You will get a 423 and render a blank image.
- Register these as **eager transformations at upload time** for report derivatives, then read the stored `secure_url` from the upload response.
- Where a delivery-time generative URL is unavoidable (user-tweakable report editor), the client must handle 423 with a retry/backoff and a loading state.

**Billing note:** `b_gen_fill` and `e_gen_recolor` use a *special transformation count*, higher than a standard transform. Budget accordingly — see the gen-AI cost cap in `ARCHITECTURE.md` §10.

**Other limits:**
- `b_gen_fill` only works on non-transparent images.
- `b_gen_fill` is unsupported for animated images and fetched images.
- Use `seed_N` for a reproducible `b_gen_fill` result; keep preceding transformations identical.

---

## 5. Named Transformations

Four named transforms. Each is a string stored in `asset_derivatives.transformation`.

| Name | String | Purpose |
|------|--------|---------|
| `report_thumb` | `c_lfill,g_auto,w_400,h_300/q_auto:eco/f_auto` | Card / grid thumbnail. Never upscales, never cuts the subject out. |
| `report_full` | `c_limit,w_1920/q_auto:eco/f_auto` | Full-width report image |
| `report_social` | `c_fill_pad,g_auto,w_1080,h_1350/q_auto:eco/f_auto` | Social / vertical. Pads rather than hard-cropping evidence. |
| `report_diff` | `c_limit,w_1600/q_auto:eco/f_auto` | Normalize our rendered diff PNG |

**Generative report transforms** (derivative-only, `is_generative = true`):

| Purpose | String |
|---------|--------|
| 16:9 landscape expand | `ar_16:9,c_pad,b_gen_fill` |
| Privacy — remove person | `e_gen_remove:prompt_person` |
| Privacy — remove all text | `e_gen_remove:prompt_text` |
| Privacy — remove region | `e_gen_remove:region_(x_0;y_0;w_400;h_300)` |
| Branding recolor | `e_gen_recolor:prompt_<filename>;to-color_1B5E3F` |
| Background replace | `e_gen_background_replace` |
| Quality restore | `e_gen_restore` |
| Report enhancement | `e_auto_enhance` / `e_auto_contrast` / `e_improve` |

> All of the above return **423 Locked** or **420 Pending** while generating. Register them as
> eager transformations at upload, or run them as a BullMQ job that polls. A synchronous
> `fetch()` of a generative URL will hang and burns a gen-AI credit per attempt. Budget for
> gen-AI separately — it draws on a premium allowance, not the transformation quota.

---

## 5a. Delivery Type Is Part of the URL

Not a transformation parameter, but it appears in the same URL and is easy to get wrong.

| Kind | Upload | URL path segment | Access |
|------|--------|------------------|--------|
| Original evidence | `type: authenticated` | `/image/authenticated/` | `auth_token` with a real `exp` |
| Derivative / report copy | `type: upload` | `/image/upload/` | Signed URL, CDN-cacheable |

The segment in the delivery URL must match the upload type. Serving an `authenticated` asset
from an `/image/upload/` URL does not fail loudly — it fails as a 404 that looks like a bad
`public_id`, which sends you hunting the wrong bug.

**URL signing has no expiry.** The `s--<hmac>--` segment authenticates the URL but never
expires; `v{...}` is a cache-busting version counter, not a deadline. Real expiry requires an
`auth_token` on an `authenticated` asset. Never document a signed `type: upload` URL as
"time-limited".

**Do not bump the version to refresh media.** Public IDs are content-addressed
(`{org_id}/{project_id}/{sha256}`) with `invalidate: false`, so a given `public_id` always
resolves to the same bytes. Versioning is for derivatives, not for re-serving originals.

---

## 6. What Moved Out Of The Transformation List

These are **not** transformations. Keep them separate so nobody writes them into a URL.

| Capability | Correct mechanism |
|------------|-------------------|
| AI tagging | Upload param `categorization: "google_tagging"`, `auto_tagging` |
| Object detection labels | Upload param `detection: "openimages"` |
| Content moderation | Upload param `moderation: "webpurify"` |
| Captioning | Add-on **API** call, persisted by us |
| Translation | Add-on **API** call, persisted by us |
| Object counting | Our CV model (`model_registry`), `change_events.model_version` |
| Anomaly scoring | Our CV model |
| Executive summary | LLM over already-computed metrics; never produces a number |
| Face/plate blur | `e_blur_faces` ✅ real, or the OCR/text detection add-on |

---

## 7. Upload Parameters (not transformations)

Passed to the upload call, not embedded in a delivery URL:

```
categorization = "google_tagging"
auto_tagging   = 0.7
detection      = "openimages"
moderation     = "webpurify"
context        = { ...signed integrity claims... }
metadata       = { sha256, exif, gps }
```

These do **not** count against the transformation quota.
