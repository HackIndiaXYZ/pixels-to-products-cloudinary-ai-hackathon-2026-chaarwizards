/**
 * Video capture rules (Phase "Video capture").
 *
 * `expo-camera` records the bytes; these are the platform-agnostic rules the
 * recorder is driven by: a hard 30-second cap, an auto thumbnail from the first
 * frame, and client-side keyframe hints at a configured interval so the server's
 * clip-extraction has predictable cut points. The gate asserts the 31st second
 * is never recorded — the cap is exclusive at 30 000 ms.
 */

/** Hard recording cap: 30 seconds, in milliseconds. */
export const MAX_VIDEO_DURATION_MS = 30_000;

/** Default keyframe hint interval: one hint per second. */
export const DEFAULT_KEYFRAME_INTERVAL_MS = 1_000;

/**
 * Whether the frame at `elapsedMs` is within the recordable window. The cap is
 * exclusive: `elapsedMs < 30 000`. At exactly 30 000 ms recording has stopped, so
 * anything in the 31st second (30 000–31 000 ms) returns `false`.
 */
export function shouldRecordAt(elapsedMs: number): boolean {
  return elapsedMs >= 0 && elapsedMs < MAX_VIDEO_DURATION_MS;
}

/** Clamp a requested duration to the cap; negatives clamp to 0. */
export function clampDurationMs(requestedMs: number): number {
  if (requestedMs < 0) return 0;
  return Math.min(requestedMs, MAX_VIDEO_DURATION_MS);
}

/**
 * Keyframe hint timestamps (ms) for a clip of `durationMs`, one every
 * `intervalMs` starting at 0. Timestamps at or beyond the cap are dropped, so a
 * hint never points past the recordable window.
 */
export function keyframeHints(
  durationMs: number,
  intervalMs: number = DEFAULT_KEYFRAME_INTERVAL_MS,
): readonly number[] {
  if (intervalMs <= 0) throw new RangeError('intervalMs must be positive');
  const capped = clampDurationMs(durationMs);
  const hints: number[] = [];
  for (let t = 0; t < capped && shouldRecordAt(t); t += intervalMs) {
    hints.push(t);
  }
  return hints;
}

/** The auto-thumbnail is the first frame. */
export interface ThumbnailRequest {
  readonly atMs: number;
}

export function deriveThumbnailRequest(): ThumbnailRequest {
  return { atMs: 0 };
}
