import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cld } from '../cloudinary/config';
import { useSearch } from '../features/search/hooks/useSearch';
import { FilterPanel } from '../features/search/components/FilterPanel';
import { SearchResults } from '../features/search/components/SearchResults';
import { AssetDetail } from '../features/assets/components/AssetDetail';
import {
  useAssetDerivatives,
  useAssetIntegrity,
  useAssetOriginalUrl,
} from '../features/assets/hooks/useAssetDetail';
import type { SearchFilters, AssetSearchResultRow } from '../features/search/types';

/** Search screen: facets, results, and an inline asset-detail inspector. */
export function SearchPage() {
  const [searchParams] = useSearchParams();
  const projectIdParam = searchParams.get('project') ?? undefined;

  const [filters, setFilters] = useState<SearchFilters>({});
  const [selected, setSelected] = useState<AssetSearchResultRow | null>(null);

  const search = useSearch(filters);
  const integrity = useAssetIntegrity(selected?.id);
  const derivatives = useAssetDerivatives(selected?.id);
  const originalUrlQuery = useAssetOriginalUrl(selected?.id);

  // Filter search results locally if navigated with a specific project id
  const displayData =
    search.data && projectIdParam
      ? {
          ...search.data,
          data: search.data.data.filter((a) => a.project_id === projectIdParam),
          total_matched: search.data.data.filter((a) => a.project_id === projectIdParam).length,
        }
      : search.data;

  // Resolved signed URL from API or fallback to Cloudinary URL
  const originalUrl =
    originalUrlQuery.data?.url ??
    (selected?.cloudinary_public_id ? cld.image(selected.cloudinary_public_id).toURL() : null);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Field evidence</h1>
      </div>

      <FilterPanel filters={filters} onChange={setFilters} />

      <SearchResults
        status={search.status}
        data={displayData}
        error={search.error}
        onOpenAsset={setSelected}
        onRetry={() => void search.refetch()}
      />

      {selected !== null ? (
        <AssetDetail
          asset={selected}
          originalUrl={originalUrl}
          integrityStatus={integrity.status}
          integrity={integrity.data}
          integrityError={integrity.error}
          derivativesStatus={derivatives.status}
          derivatives={derivatives.data}
          derivativesError={derivatives.error}
        />
      ) : null}
    </>
  );
}
