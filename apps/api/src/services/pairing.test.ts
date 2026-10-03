import { describe, expect, it } from 'vitest';
import { pairAssets, haversineMeters, type PairingAsset } from './pairing.js';

/**
 * Pure pairing algorithm (Phase). These cover the two named gate
 * cases — cross-sector isolation and radius bounding — plus ordering and
 * phase-splitting behaviour.
 */

const BASE_LAT = 19.1234;
const BASE_LON = 72.8765;

/** Offset a base point north by `meters` for deterministic distance fixtures. */
function north(meters: number): number {
  return BASE_LAT + meters / 111_320;
}

function asset(over: Partial<PairingAsset> & { id: string }): PairingAsset {
  return {
    observation_type: 'planting',
    phase: 'before',
    device_capture_timestamp: '2024-01-15T09:00:00.000Z',
    gps_lat: BASE_LAT,
    gps_lon: BASE_LON,
    ...over,
  };
}

describe('haversineMeters', () => {
  it('is ~0 for the same point and grows with latitude offset', () => {
    expect(haversineMeters(BASE_LAT, BASE_LON, BASE_LAT, BASE_LON)).toBeCloseTo(0, 3);
    const d = haversineMeters(BASE_LAT, BASE_LON, north(10), BASE_LON);
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(11);
  });
});

describe('pairAssets — gate: two sectors in one project never pair', () => {
  it('does not pair a planting `before` with a cleanup `after` at the same spot', () => {
    const assets: PairingAsset[] = [
      asset({ id: 'p-before', observation_type: 'planting', phase: 'before', device_capture_timestamp: '2024-01-15T09:00:00.000Z' }),
      asset({ id: 'c-after', observation_type: 'ganga_cleanup', phase: 'after', device_capture_timestamp: '2024-01-15T10:00:00.000Z' }),
    ];
    const pairs = pairAssets(assets, [
      { type: 'planting', gps_radius: 5 },
      { type: 'ganga_cleanup', gps_radius: 10 },
    ]);
    expect(pairs).toHaveLength(0);
  });

  it('pairs only within each observation type', () => {
    const assets: PairingAsset[] = [
      asset({ id: 'p-before', observation_type: 'planting', phase: 'before', device_capture_timestamp: '2024-01-15T09:00:00.000Z' }),
      asset({ id: 'p-after', observation_type: 'planting', phase: 'after', device_capture_timestamp: '2024-01-15T11:00:00.000Z' }),
      asset({ id: 'c-before', observation_type: 'ganga_cleanup', phase: 'before', device_capture_timestamp: '2024-01-15T09:30:00.000Z' }),
      asset({ id: 'c-after', observation_type: 'ganga_cleanup', phase: 'after', device_capture_timestamp: '2024-01-15T12:00:00.000Z' }),
    ];
    const pairs = pairAssets(assets, [
      { type: 'planting', gps_radius: 5 },
      { type: 'ganga_cleanup', gps_radius: 10 },
    ]);
    expect(pairs).toHaveLength(2);
    const byType = Object.fromEntries(pairs.map((p) => [p.observation_type, p]));
    expect(byType.planting?.before_asset_id).toBe('p-before');
    expect(byType.planting?.after_asset_id).toBe('p-after');
    expect(byType.ganga_cleanup?.before_asset_id).toBe('c-before');
    expect(byType.ganga_cleanup?.after_asset_id).toBe('c-after');
  });
});

describe('pairAssets — gate: assets beyond gps_radius are not clustered', () => {
  it('does not pair a before/after separated by more than the radius', () => {
    const assets: PairingAsset[] = [
      asset({ id: 'before', phase: 'before', gps_lat: BASE_LAT, device_capture_timestamp: '2024-01-15T09:00:00.000Z' }),
      // 50 m north, radius is 5 m → different cluster → no pair.
      asset({ id: 'after', phase: 'after', gps_lat: north(50), device_capture_timestamp: '2024-01-15T10:00:00.000Z' }),
    ];
    const pairs = pairAssets(assets, [{ type: 'planting', gps_radius: 5 }]);
    expect(pairs).toHaveLength(0);
  });

  it('pairs a before/after within the radius', () => {
    const assets: PairingAsset[] = [
      asset({ id: 'before', phase: 'before', gps_lat: BASE_LAT, device_capture_timestamp: '2024-01-15T09:00:00.000Z' }),
      asset({ id: 'after', phase: 'after', gps_lat: north(3), device_capture_timestamp: '2024-01-15T10:00:00.000Z' }),
    ];
    const pairs = pairAssets(assets, [{ type: 'planting', gps_radius: 5 }]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.before_asset_id).toBe('before');
    expect(pairs[0]?.after_asset_id).toBe('after');
    expect(pairs[0]?.gps_distance_meters).toBeGreaterThan(0);
    expect(pairs[0]?.time_difference_hours).toBeCloseTo(1, 3);
  });

  it('uses each observation type own radius, not a global constant', () => {
    // 8 m apart: outside a 5 m planting radius, inside a 10 m cleanup radius.
    const plantingFar: PairingAsset[] = [
      asset({ id: 'p-b', observation_type: 'planting', phase: 'before', gps_lat: BASE_LAT, device_capture_timestamp: '2024-01-15T09:00:00.000Z' }),
      asset({ id: 'p-a', observation_type: 'planting', phase: 'after', gps_lat: north(8), device_capture_timestamp: '2024-01-15T10:00:00.000Z' }),
    ];
    const cleanupNear: PairingAsset[] = [
      asset({ id: 'c-b', observation_type: 'ganga_cleanup', phase: 'before', gps_lat: BASE_LAT, device_capture_timestamp: '2024-01-15T09:00:00.000Z' }),
      asset({ id: 'c-a', observation_type: 'ganga_cleanup', phase: 'after', gps_lat: north(8), device_capture_timestamp: '2024-01-15T10:00:00.000Z' }),
    ];
    const pairs = pairAssets([...plantingFar, ...cleanupNear], [
      { type: 'planting', gps_radius: 5 },
      { type: 'ganga_cleanup', gps_radius: 10 },
    ]);
    expect(pairs.map((p) => p.observation_type)).toEqual(['ganga_cleanup']);
  });
});

describe('pairAssets — ordering & configuration', () => {
  it('pairs by temporal order within a cluster', () => {
    const assets: PairingAsset[] = [
      asset({ id: 'after', phase: 'after', device_capture_timestamp: '2024-01-15T12:00:00.000Z' }),
      asset({ id: 'before', phase: 'before', device_capture_timestamp: '2024-01-15T09:00:00.000Z' }),
    ];
    const pairs = pairAssets(assets, [{ type: 'planting', gps_radius: 5 }]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.before_asset_id).toBe('before');
    expect(pairs[0]?.after_asset_id).toBe('after');
  });

  it('never pairs an asset whose observation type is not configured', () => {
    const assets: PairingAsset[] = [
      asset({ id: 'x-b', observation_type: 'unconfigured', phase: 'before', device_capture_timestamp: '2024-01-15T09:00:00.000Z' }),
      asset({ id: 'x-a', observation_type: 'unconfigured', phase: 'after', device_capture_timestamp: '2024-01-15T10:00:00.000Z' }),
    ];
    const pairs = pairAssets(assets, [{ type: 'planting', gps_radius: 5 }]);
    expect(pairs).toHaveLength(0);
  });

  it('ignores assets with no location', () => {
    const assets: PairingAsset[] = [
      asset({ id: 'before', phase: 'before', gps_lat: null, gps_lon: null, device_capture_timestamp: '2024-01-15T09:00:00.000Z' }),
      asset({ id: 'after', phase: 'after', device_capture_timestamp: '2024-01-15T10:00:00.000Z' }),
    ];
    const pairs = pairAssets(assets, [{ type: 'planting', gps_radius: 5 }]);
    expect(pairs).toHaveLength(0);
  });
});
