import { useQuery } from '@tanstack/react-query';
import { EMPTY_FILTERS, countAssets, searchEvidence } from '../lib/queries/evidence';
import { countPairedChangeEvents } from '../lib/queries/changes';
import { countQuarantineAssets } from '../lib/queries/quarantine';
import { countVerificationBuckets, type VerificationBuckets } from '../lib/queries/integrity';
import { toAuditRate, type MetricValue } from '../lib/models';
import { SEARCH_ASSETS_LIMIT_MAX } from '../types/database';
import type { EvidencePage } from '../lib/queries/evidence';
import {
  empty,
  failed,
  loading,
  ready,
  unauthorized,
  undetermined,
  type DataState,
} from '../lib/state';
import { toDataState } from './useDataState';

export interface OverviewMetrics {
  totalAssets: DataState<MetricValue>;
  verifiedRate: DataState<MetricValue>;
  pairedChangeEvents: DataState<MetricValue>;
  quarantineItems: DataState<MetricValue>;
  buckets: DataState<VerificationBuckets>;
  evidence: DataState<EvidencePage>;
}

const MAP_PAGE_SIZE = SEARCH_ASSETS_LIMIT_MAX;

/** Preserve every service state and map only ready payloads into the metric-card shape. */
function mapState<A, B>(state: DataState<A>, map: (data: A) => B): DataState<B> {
  switch (state.status) {
    case 'loading':
      return loading<B>();
    case 'error':
      return failed<B>(state.retry);
    case 'unauthorized':
      return unauthorized<B>(state.requiredRole);
    case 'empty':
      return empty<B>(state.reason);
    case 'unknown':
      return undetermined<B>();
    case 'ready':
      return ready(map(state.data));
  }
}

/** Every KPI is a real count taken from PostgREST's `Content-Range` or from the `search_assets`
 *  RPC. No metric is ever synthesised. */
export function useOverviewMetrics(): OverviewMetrics {
  const totalAssets = useQuery({
    queryKey: ['metrics', 'total-assets'],
    queryFn: countAssets,
    staleTime: 30_000,
  });
  const buckets = useQuery({
    queryKey: ['metrics', 'verification-buckets'],
    queryFn: countVerificationBuckets,
    staleTime: 30_000,
  });
  const paired = useQuery({
    queryKey: ['metrics', 'paired-change-events'],
    queryFn: () => countPairedChangeEvents(null),
    staleTime: 60_000,
  });
  const quarantine = useQuery({
    queryKey: ['metrics', 'quarantine-count'],
    queryFn: countQuarantineAssets,
    staleTime: 30_000,
  });
  const evidence = useQuery({
    queryKey: ['evidence', { filters: EMPTY_FILTERS, page: 0 }],
    queryFn: () => searchEvidence(EMPTY_FILTERS, 0, MAP_PAGE_SIZE),
    staleTime: 30_000,
  });

  const totalAssetState = toDataState(totalAssets);
  const bucketState = toDataState(buckets);
  const pairedState = toDataState(paired);
  const quarantineState = toDataState(quarantine);
  const evidenceState = toDataState(evidence);

  /* Only `verification === 'passed'` is verified; the denominator and every excluded bucket are
     reported beside the rate so the number is auditable rather than a bare percentage. */
  const verifiedRate = mapState<VerificationBuckets, MetricValue>(bucketState, (distribution) =>
    toAuditRate({
      verified: distribution.passed,
      pending: distribution.pending,
      unknown: distribution.unknown,
      failed: distribution.failed,
      total: distribution.passed + distribution.pending + distribution.unknown + distribution.failed,
    }),
  );

  return {
    totalAssets: mapState<number, MetricValue>(totalAssetState, (value) => ({ kind: 'count', value })),
    verifiedRate,
    pairedChangeEvents: mapState<number, MetricValue>(pairedState, (value) => ({ kind: 'count', value })),
    quarantineItems: mapState<number, MetricValue>(quarantineState, (value) => ({ kind: 'count', value })),
    buckets: bucketState,
    evidence: evidenceState,
  };
}
