import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GPS_THRESHOLDS,
  evaluateGpsAccuracy,
  fixToSigningGps,
  toE7,
} from './gps.js';
import type { GpsFix } from './ports.js';

const fix = (accuracy_m: number): GpsFix => ({
  lat: 19.1234,
  lon: 72.8765,
  accuracy_m,
  altitude_m: 10.5,
  provider: 'fused',
});

describe('evaluateGpsAccuracy', () => {
  it('passes a tight fix', () => {
    const e = evaluateGpsAccuracy(fix(4), DEFAULT_GPS_THRESHOLDS);
    expect(e.verdict).toBe('ok');
    expect(e.blocked).toBe(false);
  });

  it('warns at or above the warn threshold', () => {
    expect(evaluateGpsAccuracy(fix(20)).verdict).toBe('warn');
    expect(evaluateGpsAccuracy(fix(35)).blocked).toBe(false);
  });

  it('blocks at or above the block threshold with a persisted reason', () => {
    const e = evaluateGpsAccuracy(fix(50));
    expect(e.verdict).toBe('block');
    expect(e.blocked).toBe(true);
    expect(e.message).toMatch(/exceeds block threshold/);
  });

  it('rejects inverted thresholds rather than silently passing', () => {
    expect(() =>
      evaluateGpsAccuracy(fix(10), { warnAboveMeters: 50, blockAboveMeters: 20 }),
    ).toThrow(RangeError);
  });
});

describe('E7 encoding', () => {
  it('rounds coordinates to integer E7', () => {
    expect(toE7(19.1234)).toBe(191234000);
    expect(toE7(-72.8765)).toBe(-728765000);
  });

  it('encodes a fix into integer coords while keeping accuracy numeric', () => {
    const g = fixToSigningGps(fix(3.2));
    expect(g.lat_e7).toBe(191234000);
    expect(g.lon_e7).toBe(728765000);
    expect(g.accuracy_m).toBe(3.2);
    expect(g.altitude_m).toBe(10.5);
    expect(g.provider).toBe('fused');
  });

  it('omits altitude when absent', () => {
    const g = fixToSigningGps({ lat: 1, lon: 2, accuracy_m: 5, provider: 'gps' });
    expect('altitude_m' in g).toBe(false);
  });
});
