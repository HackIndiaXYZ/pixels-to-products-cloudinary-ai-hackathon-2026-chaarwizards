import type { AssetSearchResultRow } from '../search/types';

/** A GeoJSON point feature for one asset marker. */
export interface AssetFeature {
  readonly type: 'Feature';
  readonly geometry: { readonly type: 'Point'; readonly coordinates: [number, number] };
  readonly properties: {
    readonly asset_id: string;
    readonly upload_status: string;
    readonly accuracy_m: number | null;
  };
}

export interface AssetFeatureCollection {
  readonly type: 'FeatureCollection';
  readonly features: readonly AssetFeature[];
}

/**
 * Build a GeoJSON FeatureCollection of asset markers for MapLibre. Assets with
 * no GPS point are dropped (they cannot be placed), so the map never invents a
 * `0,0` marker for a located-nowhere asset.
 */
export function buildAssetFeatureCollection(
  assets: readonly AssetSearchResultRow[],
): AssetFeatureCollection {
  const features: AssetFeature[] = [];
  for (const asset of assets) {
    if (asset.gps_point === null) {
      continue;
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: asset.gps_point.coordinates },
      properties: {
        asset_id: asset.id,
        upload_status: asset.upload_status,
        accuracy_m: asset.gps_accuracy_meters,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Approximate a GPS accuracy circle as a GeoJSON polygon of `steps` vertices,
 * centred on `[lon, lat]` with `radiusMeters`. Uses an equirectangular metres→
 * degrees conversion, adequate at the zoom levels a capture site spans. The
 * circle communicates positional uncertainty so a reviewer never reads a marker
 * as pinpoint-accurate when the fix was ±50 m.
 */
export function accuracyCircle(
  center: readonly [number, number],
  radiusMeters: number,
  steps = 64,
): { readonly type: 'Polygon'; readonly coordinates: [number, number][][] } {
  const [lon, lat] = center;
  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLat = (radiusMeters * Math.sin(angle)) / metersPerDegLat;
    const dLon =
      metersPerDegLon === 0 ? 0 : (radiusMeters * Math.cos(angle)) / metersPerDegLon;
    ring.push([lon + dLon, lat + dLat]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}
