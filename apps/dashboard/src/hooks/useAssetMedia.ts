import { useQuery } from '@tanstack/react-query';
import { resolveAssetMedia } from '../lib/queries/evidence';
import type { AssetMediaRef } from '../lib/media';
import type { DataState } from '../lib/state';
import { toRawDataState } from './useDataState';

/** Media is requested by `asset_id` only. The API route resolves the Cloudinary resource under
 *  RLS, so the client never supplies a `public_id` and never bypasses RLS to reach an original. */
export function useAssetMedia(assetId: string | null): DataState<AssetMediaRef> {
  const query = useQuery({
    queryKey: ['asset-media', assetId],
    queryFn: () => resolveAssetMedia(assetId as string),
    enabled: assetId !== null,
    staleTime: 300_000,
    gcTime: 600_000,
  });
  return toRawDataState<AssetMediaRef | null, AssetMediaRef>(query, (value) =>
    value === null ? { status: 'unknown' } : { status: 'ready', data: value },
  );
}
