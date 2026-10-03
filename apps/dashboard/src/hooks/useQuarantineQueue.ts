import { useQuery } from '@tanstack/react-query';
import { listQuarantineAssets } from '../lib/queries/quarantine';
import { getAssetIntegrity, verifyAuditChain } from '../lib/queries/integrity';
import { resolveAssetMedia } from '../lib/queries/evidence';
import {
  deriveQuarantineReason,
  toIntegrityChecks,
  type IntegrityCheck,
  type QuarantineItemModel,
} from '../lib/models';
import type { Asset } from '../types/database';
import type { DataState } from '../lib/state';
import { toDataState } from './useDataState';

const REASON_SAMPLE_LIMIT = 25;

async function buildItems(assets: Asset[]): Promise<QuarantineItemModel[]> {
  const sample = assets.slice(0, REASON_SAMPLE_LIMIT);
  return Promise.all(
    sample.map(async (asset) => {
      const [integrity, chain, media] = await Promise.all([
        getAssetIntegrity(asset.id),
        verifyAuditChain(asset.id),
        resolveAssetMedia(asset.id),
      ]);
      const checks: IntegrityCheck[] =
        integrity.status === 'ready'
          ? toIntegrityChecks(integrity.data, chain.status === 'ready' ? chain.data : null)
          : [];
      return {
        asset,
        media,
        reason: deriveQuarantineReason(checks),
        failedChecks: checks,
      } satisfies QuarantineItemModel;
    }),
  );
}

export interface QuarantineQueueResult {
  items: QuarantineItemModel[];
  /** How many items had their reasons derived from real check results. */
  sampled: number;
  /** Rows returned by the query, which is itself capped by the query limit. */
  returned: number;
}

async function loadQueue(): Promise<DataState<QuarantineQueueResult>> {
  const assets = await listQuarantineAssets(100);
  if (assets.status !== 'ready') return assets;
  const items = await buildItems(assets.data);
  return {
    status: 'ready',
    data: { items, sampled: Math.min(assets.data.length, REASON_SAMPLE_LIMIT), returned: assets.data.length },
  };
}

/** Quarantine is `assets.quarantined_at IS NOT NULL`. There is no stored reason column, so the
 *  reason is derived only from real check results and otherwise reads `Reason unavailable`. It is
 *  never generated. */
export function useQuarantineQueue(): DataState<QuarantineQueueResult> {
  const query = useQuery({
    queryKey: ['quarantine', 'queue'],
    queryFn: loadQueue,
    staleTime: 30_000,
  });
  return toDataState(query);
}
