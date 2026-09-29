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
    <section aria-label="Map" style={{ height: '80vh' }}>
      <h2>Map</h2>
      <AssetMap
        assets={data?.data ?? []}
        styleUrl="https://demotiles.maplibre.org/style.json"
        onViewportChange={(bbox) => setFilters((f) => ({ ...f, bbox }))}
      />
    </section>
  );
}
