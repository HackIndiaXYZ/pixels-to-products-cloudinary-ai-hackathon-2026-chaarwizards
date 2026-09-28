import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYFRAME_INTERVAL_MS,
  MAX_VIDEO_DURATION_MS,
  clampDurationMs,
  deriveThumbnailRequest,
  keyframeHints,
  shouldRecordAt,
} from './video.js';

describe('shouldRecordAt (30s hard cap)', () => {
  it('records within the window', () => {
    expect(shouldRecordAt(0)).toBe(true);
    expect(shouldRecordAt(29_999)).toBe(true);
  });

  it('stops exactly at the cap', () => {
    expect(shouldRecordAt(MAX_VIDEO_DURATION_MS)).toBe(false);
  });

  it('does not record the 31st second', () => {
    expect(shouldRecordAt(30_500)).toBe(false);
    expect(shouldRecordAt(31_000)).toBe(false);
  });
});

describe('clampDurationMs', () => {
  it('caps at 30s and floors at 0', () => {
    expect(clampDurationMs(45_000)).toBe(MAX_VIDEO_DURATION_MS);
    expect(clampDurationMs(10_000)).toBe(10_000);
    expect(clampDurationMs(-5)).toBe(0);
  });
});

describe('keyframeHints', () => {
  it('emits one hint per interval, none past the cap', () => {
    const hints = keyframeHints(30_000, DEFAULT_KEYFRAME_INTERVAL_MS);
    expect(hints[0]).toBe(0);
    expect(hints).toHaveLength(30); // 0..29000
    expect(Math.max(...hints)).toBeLessThan(MAX_VIDEO_DURATION_MS);
  });

  it('honours a custom interval', () => {
    expect(keyframeHints(10_000, 2_500)).toEqual([0, 2_500, 5_000, 7_500]);
  });

  it('never exceeds the cap even for an over-long request', () => {
    const hints = keyframeHints(60_000, 5_000);
    expect(Math.max(...hints)).toBeLessThan(MAX_VIDEO_DURATION_MS);
  });

  it('rejects a non-positive interval', () => {
    expect(() => keyframeHints(10_000, 0)).toThrow(RangeError);
  });
});

describe('deriveThumbnailRequest', () => {
  it('takes the first frame', () => {
    expect(deriveThumbnailRequest()).toEqual({ atMs: 0 });
  });
});
