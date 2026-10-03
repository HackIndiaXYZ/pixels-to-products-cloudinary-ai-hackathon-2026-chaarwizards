import type { AssetIntegrity, AuditChainResult, AuditLog } from '../../types/database';
import { failed, ready, undetermined, type DataState } from '../state';
import { rpc, table } from '../supabase/client';
import { parseAssetIntegrity, parseAuditChain, parseAuditLogs, VERIFICATIONS } from './parse';

/** `asset_integrity` returns null when the row is absent or RLS-hidden. That is "cannot
 *  determine", so it maps to `unknown` — never to a pass. */
export async function getAssetIntegrity(assetId: string): Promise<DataState<AssetIntegrity>> {
  const envelope = await rpc('asset_integrity', { p_asset_id: assetId });
  if (envelope.error) return failed();
  const parsed = parseAssetIntegrity(envelope.data);
  return parsed === null ? undetermined() : ready(parsed);
}

/** `verify_audit_chain` reports what it actually checked. A zero-length chain is reported as the
 *  RPC's own `checked: 0` plus its `ok`, never as a pass the backend did not give. A NULL payload
 *  is `unknown`, never a pass. */
export async function verifyAuditChain(assetId: string): Promise<DataState<AuditChainResult>> {
  const envelope = await rpc('verify_audit_chain', { p_asset_id: assetId });
  if (envelope.error) return failed();
  const parsed = parseAuditChain(envelope.data);
  return parsed === null ? undetermined() : ready(parsed);
}

export interface AuditLogPage {
  rows: AuditLog[];
  hasMore: boolean;
}

/** `audit_logs` is partitioned by `hashed_at`, so the page is read in that order. Each row carries
 *  its own `asset_id` / `change_event_id` / `evidence_package_id`; nothing is joined in the
 *  browser, because RLS already decided what this session may see. */
export async function listAuditLogs(assetId: string | null, limit = 25): Promise<DataState<AuditLogPage>> {
  const logs = table('audit_logs');
  if (logs === null) return failed();
  const scoped = assetId === null ? logs : logs.eq('asset_id', assetId);
  const envelope = await scoped
    .select('*')
    .order('hashed_at', false)
    .limit(limit + 1);
  if (envelope.error) return failed();
  const rows = parseAuditLogs(envelope.data);
  return ready<AuditLogPage>({ rows: rows.slice(0, limit), hasMore: rows.length > limit });
}

export interface VerificationBuckets {
  passed: number;
  pending: number;
  failed: number;
  unknown: number;
}

/** Exact per-value counts, so the verified rate is `passed / total` over the real distribution.
 *  `pending` and `unknown` are never folded into `passed`. */
export async function countVerificationBuckets(): Promise<DataState<VerificationBuckets>> {
  const buckets: VerificationBuckets = { passed: 0, pending: 0, failed: 0, unknown: 0 };
  const counted = await Promise.all(
    VERIFICATIONS.map(async (value) => {
      const assets = table('assets');
      if (assets === null) return { value, count: null as number | null, failed: true };
      const envelope = await assets.eq('verification', value).countExact();
      return { value, count: envelope.count, failed: envelope.error !== null };
    }),
  );
  for (const entry of counted) {
    if (entry.failed) return failed();
    /* A NULL count means the backend did not give an exact number, so the whole distribution is
       undetermined rather than reported as zeroes. */
    if (entry.count === null) return undetermined();
    if (entry.value === 'passed') buckets.passed = entry.count;
    else if (entry.value === 'pending') buckets.pending = entry.count;
    else if (entry.value === 'failed') buckets.failed = entry.count;
    else if (entry.value === 'unknown') buckets.unknown = entry.count;
  }
  return ready(buckets);
}