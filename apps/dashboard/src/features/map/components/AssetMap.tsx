import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import type { AssetSearchResultRow } from '../../search/types';
import { buildAssetFeatureCollection } from '../geo';

/**
 * MapLibre GL asset map (BUILD_ORDER Phase 8): clustered markers with accuracy
 * circles, and viewport-driven search — `onViewportChange` fires the current
 * bounding box on `moveend` so the parent can refetch the assets in view.
 *
 * MapLibre (not Mapbox) so no proprietary token ships in the client bundle
 * (FRONTEND_ARCHITECTURE.md — State Management). Marker positions come from GPS
 * points the API already returned; the map never queries Cloudinary.
 */
export interface AssetMapProps {
  readonly assets: readonly AssetSearchResultRow[];
  readonly styleUrl: string;
  readonly onViewportChange?: (bbox: [number, number, number, number]) => void;
}

const SOURCE_ID = 'assets';

/** MapLibre's source APIs expect a mutable GeoJSON type; our builder returns a
 * readonly view for immutability elsewhere. This narrows it back structurally. */
function asGeoJson(
  assets: readonly AssetSearchResultRow[],
): FeatureCollection<Geometry, GeoJsonProperties> {
  return buildAssetFeatureCollection(assets) as unknown as FeatureCollection<
    Geometry,
    GeoJsonProperties
  >;
}

export function AssetMap({ assets, styleUrl, onViewportChange }: AssetMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (containerRef.current === null) {
      return;
    }
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: [0, 0],
      zoom: 1,
    });
    mapRef.current = map;

    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: asGeoJson(assets),
        cluster: true,
        clusterRadius: 50,
      });
      // Clustered points.
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: { 'circle-radius': 18, 'circle-color': '#3b82f6' },
      });
      // Unclustered points.
      map.addLayer({
        id: 'unclustered',
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-radius': 6, 'circle-color': '#10b981' },
      });
    });

    const emitViewport = () => {
      if (!onViewportChange) {
        return;
      }
      const b = map.getBounds();
      onViewportChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    };
    map.on('moveend', emitViewport);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Re-create the map only when the style changes; asset updates flow through
    // the effect below via `source.setData`, so they are intentionally excluded.
  }, [styleUrl]);

  // Push new asset data into the existing source without rebuilding the map.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) {
      return;
    }
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(asGeoJson(assets));
    }
  }, [assets]);

  return <div ref={containerRef} data-testid="asset-map" style={{ width: '100%', height: '100%' }} />;
}
