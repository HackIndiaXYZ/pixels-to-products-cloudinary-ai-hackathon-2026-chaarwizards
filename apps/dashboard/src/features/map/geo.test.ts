import { describe, expect, it } from 'vitest';
import { accuracyCircle, buildAssetFeatureCollection } from './geo';
import type { AssetSearchResultRow } from '../search/types';

function row(id: string, coords: [number, number] | null): AssetSearchResultRow {
  return {
    id,
    project_id: 'p1',
    cloudinary_public_id: `org/p1/${id}`,
    asset_type: 'image',
    device_capture_timestamp: '2024-01-15T09:30:00Z',
    gps_point: coords ? { type: 'Point', coordinates: coords } : null,
    gps_accuracy_meters: coords ? 5 : null,
    gps_provider: 'fused',
    caption: null,
    ai_tags: [],
    observation_type: null,
    phase: null,
    upload_status: 'verified',
  };
}

describe('buildAssetFeatureCollection', () => {
  it('emits a point feature per located asset and drops assets with no GPS', () => {
    const fc = buildAssetFeatureCollection([row('a', [72.8, 19.1]), row('b', null)]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]?.geometry.coordinates).toEqual([72.8, 19.1]);
    expect(fc.features[0]?.properties.asset_id).toBe('a');
  });
});

describe('accuracyCircle', () => {
  it('returns a closed ring of the requested resolution', () => {
    const circle = accuracyCircle([72.8, 19.1], 50, 32);
    const ring = circle.coordinates[0];
    expect(ring).toHaveLength(33); // steps + 1, closed
    expect(ring?.[0]).toEqual(ring?.[ring.length - 1]);
  });

  it('scales with radius — a larger accuracy draws a wider circle', () => {
    const small = accuracyCircle([0, 0], 10);
    const large = accuracyCircle([0, 0], 100);
    const spanSmall = Math.abs((small.coordinates[0]?.[0]?.[0] ?? 0));
    const spanLarge = Math.abs((large.coordinates[0]?.[0]?.[0] ?? 0));
    expect(spanLarge).toBeGreaterThan(spanSmall);
  });
});
