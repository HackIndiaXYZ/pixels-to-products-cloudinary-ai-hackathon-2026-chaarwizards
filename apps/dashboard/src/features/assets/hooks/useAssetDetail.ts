import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/queryKeys';
import { getAssetDerivatives, getAssetIntegrity, requestOriginalUrl } from '../api';

/** Load the three-state integrity verdict for an asset. */
export function useAssetIntegrity(assetId: string | undefined) {
  return useQuery({
    queryKey: assetId ? queryKeys.assets.integrity(assetId) : ['assets', 'integrity', 'none'],
    queryFn: () => getAssetIntegrity(assetId as string),
    enabled: assetId !== undefined,
  });
}

/** Load the append-only derivative lineage for an asset (§3.1). */
export function useAssetDerivatives(assetId: string | undefined) {
  return useQuery({
    queryKey: assetId ? queryKeys.assets.derivatives(assetId) : ['assets', 'derivatives', 'none'],
    queryFn: () => getAssetDerivatives(assetId as string),
    enabled: assetId !== undefined,
  });
}

/** Load the short-TTL signed original URL for an asset (§3.11). */
export function useAssetOriginalUrl(assetId: string | undefined) {
  return useQuery({
    queryKey: assetId ? ['assets', 'original-url', assetId] : ['assets', 'original-url', 'none'],
    queryFn: () => requestOriginalUrl(assetId as string),
    enabled: assetId !== undefined,
  });
}
