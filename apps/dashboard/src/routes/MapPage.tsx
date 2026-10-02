import { useState } from 'react';
import { useSearch } from '../features/search/hooks/useSearch';
import { AssetMap } from '../features/map/components/AssetMap';
import type { SearchFilters } from '../features/search/types';

/**
 * Fullscreen map with viewport-driven search: panning the map updates the
 * `bbox` facet, which refetches the assets in view.
 */
export function MapPage() {
  const [filters, setFilters] = useState<SearchFilters>({});
  const { data } = useSearch(filters);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Map view</h1>
      </div>
      <section className="map-section" aria-label="Map" style={{ height: '72vh' }}>
        <AssetMap
          assets={data?.data ?? []}
          styleUrl="https://demotiles.maplibre.org/style.json"
          onViewportChange={(bbox) => setFilters((f) => ({ ...f, bbox }))}
        />
        <div className="map-controls" aria-label="Map style">
          <button type="button" className="map-btn active">Map</button>
          <button type="button" className="map-btn">Satellite</button>
        </div>
      </section>
    </>
  );
}
