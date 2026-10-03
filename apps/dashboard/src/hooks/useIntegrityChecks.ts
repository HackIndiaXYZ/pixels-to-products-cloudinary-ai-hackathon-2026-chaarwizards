import { useQuery } from '@tanstack/react-query';
import { getAssetIntegrity, verifyAuditChain } from '../lib/queries/integrity';
import { toIntegrityChecks, type IntegrityCheck } from '../lib/models';
import type { AssetIntegrity } from '../types/database';
import { ready, undetermined, type DataState } from '../lib/state';
import { toDataState } from './useDataState';

export interface IntegrityReport {
  integrity: AssetIntegrity;
  checks: IntegrityCheck[];
}

/** Per-check `pass | fail | unknown` breakdown. A NULL boolean from the RPC is `unknown` and is
 *  never collapsed to a pass, and each check names the exact RPC field it came from. */
export function useIntegrityChecks(assetId: string | null): DataState<IntegrityReport> {
  const integrity = useQuery({
    queryKey: ['integrity', assetId],
    queryFn: () => getAssetIntegrity(assetId as string),
    enabled: assetId !== null,
    staleTime: 30_000,
  });
  const chain = useQuery({
    queryKey: ['integrity-chain', assetId],
    queryFn: () => verifyAuditChain(assetId as string),
    enabled: assetId !== null,
    staleTime: 30_000,
  });

  const state = toDataState(integrity);
  if (assetId === null) return undetermined<IntegrityReport>();
  if (state.status !== 'ready') return state;
  const chainResult = chain.data?.status === 'ready' ? chain.data.data : null;
  return ready<IntegrityReport>({
    integrity: state.data,
    checks: toIntegrityChecks(state.data, chainResult),
  });
}
