/**
 * GPS capture and accuracy gating (Phase "GPS").
 *
 * `expo-location` is read at `BestForNavigation`. We record `lat`, `lon`,
 * `accuracy_m`, `altitude_m` and `provider`, and gate on the horizontal accuracy:
 * above a warn threshold the UI warns; above a block threshold capture is
 * refused, because a fix too coarse to place the evidence would poison pairing
 * (which clusters by `gps_radius`). The GPS fix feeds the signed payload as
 * integer E7 coordinates via {@link GPS_COORD_SCALE}.
 */
import { GPS_COORD_SCALE } from '@panchnama/shared/rn';
import type { GpsFix } from './ports.js';

/** Accuracy thresholds in metres. `block >= warn` by construction. */
export interface GpsThresholds {
  /** At or above this horizontal accuracy (m), warn the user. */
  readonly warnAboveMeters: number;
  /** At or above this horizontal accuracy (m), refuse capture. */
  readonly blockAboveMeters: number;
}

/** Sensible default: warn past 20 m, block past 50 m. */
export const DEFAULT_GPS_THRESHOLDS: GpsThresholds = {
  warnAboveMeters: 20,
  blockAboveMeters: 50,
};

export type GpsAccuracyVerdict = 'ok' | 'warn' | 'block';

export interface GpsAccuracyEvaluation {
  readonly verdict: GpsAccuracyVerdict;
  /** True only when capture must be refused. */
  readonly blocked: boolean;
  readonly accuracy_m: number;
  /** Human-facing reason, persisted when a capture is blocked . */
  readonly message: string;
}

/**
 * Classify a fix against thresholds. `block` dominates `warn`; a fix exactly at a
 * threshold triggers it (`>=`), so the boundary is not a silent gap.
 */
export function evaluateGpsAccuracy(
  fix: GpsFix,
  thresholds: GpsThresholds = DEFAULT_GPS_THRESHOLDS,
): GpsAccuracyEvaluation {
  if (thresholds.blockAboveMeters < thresholds.warnAboveMeters) {
    throw new RangeError('blockAboveMeters must be >= warnAboveMeters');
  }
  const accuracy_m = fix.accuracy_m;
  if (accuracy_m >= thresholds.blockAboveMeters) {
    return {
      verdict: 'block',
      blocked: true,
      accuracy_m,
      message: `GPS accuracy ${accuracy_m} m exceeds block threshold ${thresholds.blockAboveMeters} m`,
    };
  }
  if (accuracy_m >= thresholds.warnAboveMeters) {
    return {
      verdict: 'warn',
      blocked: false,
      accuracy_m,
      message: `GPS accuracy ${accuracy_m} m is above the ${thresholds.warnAboveMeters} m warning threshold`,
    };
  }
  return {
    verdict: 'ok',
    blocked: false,
    accuracy_m,
    message: `GPS accuracy ${accuracy_m} m`,
  };
}

/** Integer E7 encoding of a coordinate for the signed payload . */
export function toE7(degrees: number): number {
  return Math.round(degrees * GPS_COORD_SCALE);
}

/**
 * Encode a fix into the integer-coordinate shape the signing payload expects.
 * `accuracy_m` / `altitude_m` stay numeric (they map to `float8` columns that
 * round-trip a double exactly); only lat/lon are integerized.
 */
export function fixToSigningGps(fix: GpsFix): {
  lat_e7: number;
  lon_e7: number;
  accuracy_m: number;
  altitude_m?: number;
  provider: GpsFix['provider'];
} {
  const base = {
    lat_e7: toE7(fix.lat),
    lon_e7: toE7(fix.lon),
    accuracy_m: fix.accuracy_m,
    provider: fix.provider,
  };
  return fix.altitude_m === undefined ? base : { ...base, altitude_m: fix.altitude_m };
}
