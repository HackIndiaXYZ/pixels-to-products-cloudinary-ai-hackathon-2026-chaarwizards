import { useQuery } from '@tanstack/react-query';
import { getAsset, getAssetDerivatives, getObservations, resolveAssetMedia } from '../lib/queries/evidence';
import { toEvidenceDetailModel, toLineageForest, type EvidenceDetailModel, type LineageNode } from '../lib/models';
import type { AssetDerivative, Observation } from '../types/database';
import { ready, undetermined, type DataState } from '../lib/state';
import { rowsOf, toDataState } from './useDataState';

export interface EvidenceAssetBundle {
  detail: EvidenceDetailModel;
  derivatives: AssetDerivative[];
  observations: Observation[];
}

/** `search_assets` does not return `verification`, so the inspector reads the full `assets` row
 *  to show it. Both queries run under RLS for the caller's org. */
export function useEvidenceAsset(assetId: string | null): DataState<EvidenceAssetBundle> {
  const asset = useQuery({
    queryKey: ['evidence-asset', assetId],
    queryFn: () => getAsset(assetId as string),
    enabled: assetId !== null,
    staleTime: 30_000,
  });
  const derivatives = useQuery({
    queryKey: ['evidence-derivatives', assetId],
    queryFn: () => getAssetDerivatives(assetId as string),
    enabled: assetId !== null,
    staleTime: 60_000,
  });
  const observations = useQuery({
    queryKey: ['evidence-observations', assetId],
    queryFn: () => getObservations(assetId as string),
    enabled: assetId !== null,
    staleTime: 60_000,
  });
  const media = useQuery({
    queryKey: ['evidence-media', assetId],
    queryFn: () => resolveAssetMedia(assetId as string),
    enabled: assetId !== null,
    staleTime: 300_000,
  });

  const assetState = toDataState(asset);
  if (assetState.status !== 'ready') return assetState;
  const derivativeRows = rowsOf(derivatives.data);
  const observationRows = rowsOf(observations.data);
  return ready<EvidenceAssetBundle>({
    detail: { ...toEvidenceDetailModel(assetState.data, media.data ?? null), observations: observationRows },
    derivatives: derivativeRows,
    observations: observationRows,
  });
}

export interface LineageForest {
  root: LineageNode;
  children: LineageNode[];
}

export function useAssetLineage(assetId: string | null): DataState<LineageForest> {
  const query = useQuery({
    queryKey: ['evidence-derivatives', assetId],
    queryFn: () => getAssetDerivatives(assetId as string),
    enabled: assetId !== null,
    staleTime: 60_000,
  });
  if (assetId === null) return undetermined<LineageForest>();
  const state = toDataState(query);
  if (state.status !== 'ready') return state;
  return ready<LineageForest>(toLineageForest(assetId, state.data));
}
