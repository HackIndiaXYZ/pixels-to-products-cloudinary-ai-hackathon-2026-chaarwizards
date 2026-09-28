/**
 * Cloudinary transformation catalogue (BUILD_ORDER Phase 5; the ONLY verified
 * source is `docs/architecture/CLOUDINARY_TRANSFORMATIONS.md`). Every string
 * here is copied verbatim from that document — nothing is invented, and the
 * effects proven not to exist (`e_diff`, `e_gen_expand`, `e_gen_caption`, …) are
 * deliberately absent (§2 of that doc).
 *
 * These are the exact strings stored in `asset_derivatives.transformation`
 * (AGENTS.md §3.1), so the bytes a derivative was built from can be re-derived
 * and audited later.
 */

/** Four named report transforms — CLOUDINARY_TRANSFORMATIONS.md §5. */
export const NAMED_TRANSFORMS = {
  report_thumb: 'c_lfill,g_auto,w_400,h_300/q_auto:eco/f_auto',
  report_full: 'c_limit,w_1920/q_auto:eco/f_auto',
  report_social: 'c_fill_pad,g_auto,w_1080,h_1350/q_auto:eco/f_auto',
  report_diff: 'c_limit,w_1600/q_auto:eco/f_auto',
} as const;

export type NamedTransform = keyof typeof NAMED_TRANSFORMS;

/**
 * The report copies a generative edit is permitted to build on. A generative
 * transform on anything else (an original, or a non-report derivative) is
 * rejected — AGENTS.md §3.1 confines generative edits to report copies.
 */
export const REPORT_KINDS: ReadonlySet<string> = new Set<NamedTransform>([
  'report_thumb',
  'report_full',
  'report_social',
  'report_diff',
]);

/**
 * Generative report transforms — CLOUDINARY_TRANSFORMATIONS.md §5, derivative
 * only, `is_generative = true`. Note `b_gen_fill` is a `b_` background qualifier,
 * not an `e_` effect (§1), and it must be paired with a pad crop.
 */
export const GENERATIVE_TRANSFORMS = {
  landscape_expand: 'ar_16:9,c_pad,b_gen_fill',
  remove_person: 'e_gen_remove:prompt_person',
  remove_text: 'e_gen_remove:prompt_text',
  remove_region: 'e_gen_remove:region_(x_0;y_0;w_400;h_300)',
  background_replace: 'e_gen_background_replace',
  quality_restore: 'e_gen_restore',
} as const;

export type GenerativeTransform = keyof typeof GENERATIVE_TRANSFORMS;

/**
 * Streaming profile for video delivery — CLOUDINARY_TRANSFORMATIONS.md §1
 * (`sp_auto`).
 */
export const STREAMING_PROFILE = 'sp_auto' as const;

/**
 * Every verified-real transformation parameter from
 * CLOUDINARY_TRANSFORMATIONS.md §1. The Phase 5 gate asserts each one is
 * accepted by the Cloudinary SDK without error. Values are the literal tokens as
 * they appear in a delivery URL.
 */
export const VERIFIED_TRANSFORM_PARAMS: readonly string[] = [
  // Resize and crop
  'c_fill',
  'c_lfill',
  'c_limit',
  'c_scale',
  'c_pad',
  'c_mpad',
  'c_lpad',
  'c_fill_pad',
  'c_auto_pad',
  'c_thumb',
  'c_auto',
  'g_auto',
  'ar_16:9',
  'w_400',
  'h_300',
  // Optimization
  'f_auto',
  'q_auto',
  'q_auto:low',
  'q_auto:good',
  'q_auto:eco',
  'q_auto:best',
  // Responsive delivery
  'w_auto',
  'dpr_auto',
  // Generative AI
  'b_gen_fill',
  'e_gen_remove',
  'e_gen_recolor',
  'e_gen_replace',
  'e_gen_restore',
  'e_gen_background_replace',
  // Image AI
  'e_auto_enhance',
  'e_auto_contrast',
  'e_enhance',
  'e_improve',
  'e_contrast',
  // Video
  'so_0',
  'eo_5',
  'du_5',
  'sp_auto',
  // Layers
  'l_watermark',
  'fl_layer_apply',
  'e_multiply',
  'e_overlay',
  'e_screen',
  'e_anti_removal',
];

/**
 * A generative transform is asynchronous (420/423) and cost-bearing, so it is
 * detected here to force it down the eager-upload / job path rather than a
 * synchronous delivery URL. Matches the `e_gen_*` effects and the `b_gen_fill`
 * qualifier from §1 / §5.
 */
export function isGenerativeTransformation(transformation: string): boolean {
  return /(^|,|\/)(e_gen_|b_gen_)/.test(transformation);
}

/** Resolve a named transform to its exact string, or return the input unchanged. */
export function resolveTransformation(nameOrString: string): string {
  if (nameOrString in NAMED_TRANSFORMS) {
    return NAMED_TRANSFORMS[nameOrString as NamedTransform];
  }
  return nameOrString;
}

export interface VideoClip {
  /** Start offset in seconds (`so_`). */
  readonly startSeconds: number;
  /** End offset in seconds (`eo_`). Mutually informative with duration. */
  readonly endSeconds?: number;
  /** Clip duration in seconds (`du_`). */
  readonly durationSeconds?: number;
}

/**
 * Build a video clip-extraction transformation from the verified `so_`/`eo_`/`du_`
 * parameters (CLOUDINARY_TRANSFORMATIONS.md §1, §Video). At least one of
 * `endSeconds` / `durationSeconds` must be supplied so the clip is bounded.
 */
export function videoClipTransformation(clip: VideoClip): string {
  if (clip.startSeconds < 0) {
    throw new Error('video clip startSeconds must be >= 0');
  }
  if (clip.endSeconds === undefined && clip.durationSeconds === undefined) {
    throw new Error('video clip requires endSeconds or durationSeconds');
  }
  const parts = [`so_${clip.startSeconds}`];
  if (clip.endSeconds !== undefined) {
    if (clip.endSeconds <= clip.startSeconds) {
      throw new Error('video clip endSeconds must be > startSeconds');
    }
    parts.push(`eo_${clip.endSeconds}`);
  }
  if (clip.durationSeconds !== undefined) {
    if (clip.durationSeconds <= 0) throw new Error('video clip durationSeconds must be > 0');
    parts.push(`du_${clip.durationSeconds}`);
  }
  return parts.join(',');
}
