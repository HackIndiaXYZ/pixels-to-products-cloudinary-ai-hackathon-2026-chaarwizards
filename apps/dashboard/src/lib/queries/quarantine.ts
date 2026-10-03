import type { Asset } from '../../types/database';
import { failed, ready, readyOrEmpty, undetermined, type DataState } from '../state';
import { table } from '../supabase/client';
import { parseAssets } from './parse';

const QUARANTINE_FLOOR = '1970-01-01T00:00:00Z';

/** Quarantine is a filter on `assets`, not a separate table: `quarantined_at IS NOT NULL`.
 *  There is no quarantine table and no stored reason column. */
export async function countQuarantineAssets(): Promise<DataState<number>> {
  const assets = table('assets');
  if (assets === null) return failed();
  const envelope = await assets
    .select('*', { count: 'exact', head: true })
    .gte('quarantined_at', QUARANTINE_FLOOR)
    .countExact();
  if (envelope.error) return failed();
  return envelope.count === null ? undetermined() : ready(envelope.count);
}

export async function listQuarantineAssets(limit = 100): Promise<DataState<Asset[]>> {
  const assets = table('assets');
  if (assets === null) return failed();
  const envelope = await assets
    .select('*')
    .gte('quarantined_at', QUARANTINE_FLOOR)
    .order('quarantined_at', false)
    .limit(limit);
  if (envelope.error) return failed();
  return readyOrEmpty(parseAssets(envelope.data));
}

export async function listVerifiedAssets(projectId: string, limit = 100): Promise<DataState<Asset[]>> {
  const assets = table('assets');
  if (assets === null) return failed();
  /* A quarantined asset is visibly excluded from any verified evidence selection: the server-side
     filter excludes it up front rather than hiding it after selection. */
  const envelope = await assets
    .select('*')
    .eq('project_id', projectId)
    .eq('verification', 'passed')
    .lt('quarantined_at', QUARANTINE_FLOOR)
    .order('device_capture_timestamp', false)
    .limit(limit);
  if (envelope.error) return failed();
  return readyOrEmpty(parseAssets(envelope.data));
}
