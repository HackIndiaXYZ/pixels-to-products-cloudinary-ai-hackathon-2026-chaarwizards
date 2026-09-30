import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/queryKeys';
import { getChainVerification, getReportVerification } from '../api';

/**
 * Structured audit-chain verification for an asset (Phase 10 chain verifier).
 * The verdict names the first tampered row or gap; the integrity viewer renders
 * it as a chain visualization.
 */
export function useChainVerification(assetId: string | undefined) {
  return useQuery({
    queryKey: assetId ? queryKeys.assets.verifyChain(assetId) : ['assets', 'verify-chain', 'none'],
    queryFn: () => getChainVerification(assetId as string),
    enabled: assetId !== undefined,
  });
}

/** Public-safe verification receipt for a report (Phase 10 report verification). */
export function useReportVerification(reportId: string | undefined) {
  return useQuery({
    queryKey: reportId ? queryKeys.reports.verification(reportId) : ['reports', 'verification', 'none'],
    queryFn: () => getReportVerification(reportId as string),
    enabled: reportId !== undefined,
  });
}
