import { useState } from 'react';
import { useSearch } from '../features/search/hooks/useSearch';
import { FilterPanel } from '../features/search/components/FilterPanel';
import { SearchResults } from '../features/search/components/SearchResults';
import { AssetDetail } from '../features/assets/components/AssetDetail';
import {
  useAssetDerivatives,
  useAssetIntegrity,
} from '../features/assets/hooks/useAssetDetail';
import type { SearchFilters, AssetSearchResultRow } from '../features/search/types';

/** Search screen: facets, results, and an inline asset-detail inspector. */
export function SearchPage() {
  const [filters, setFilters] = useState<SearchFilters>({});
  const [selected, setSelected] = useState<AssetSearchResultRow | null>(null);

  const search = useSearch(filters);
  const integrity = useAssetIntegrity(selected?.id);
  const derivatives = useAssetDerivatives(selected?.id);

  return (
    <section aria-label="Search">
      <h2>Search</h2>
      <FilterPanel filters={filters} onChange={setFilters} />
      <SearchResults
        status={search.status}
        data={search.data}
        error={search.error}
        onOpenAsset={setSelected}
        onRetry={() => void search.refetch()}
      />
      {selected !== null ? (
        <AssetDetail
          asset={selected}
          originalUrl={null}
          integrityStatus={integrity.status}
          integrity={integrity.data}
          integrityError={integrity.error}
          derivativesStatus={derivatives.status}
          derivatives={derivatives.data}
          derivativesError={derivatives.error}
        />
      ) : null}
    </section>
  );
}
