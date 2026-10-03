import type { Asset, ChangeEvent, ModelRegistryEntry } from '../../types/database';
import { failed, ready, readyOrEmpty, undetermined, type DataState } from '../state';
import { rpc, table } from '../supabase/client';
import { asArray, asRecord, num, parseAssets, parseChangeEvents, parseModelRegistry, requiredStr } from './parse';

export interface PairingCandidate {
  projectId: string;
  before: Asset;
  after: Asset;
}

export async function listChangeEvents(projectId: string | null, limit = 50): Promise<DataState<ChangeEvent[]>> {
  const events = table('change_events');
  if (events === null) return failed();
  let query = events.select('*').order('created_at', false).limit(limit);
  if (projectId !== null) query = query.eq('project_id', projectId);
  const envelope = await query;
  if (envelope.error) return failed();
  return readyOrEmpty(parseChangeEvents(envelope.data));
}

export async function getChangeEventAssets(event: ChangeEvent): Promise<DataState<[Asset | null, Asset | null]>> {
  const assets = table('assets');
  if (assets === null) return failed();
  const ids = [event.before_asset_id, event.after_asset_id].filter((id): id is string => id !== null);
  if (ids.length === 0) return ready<[Asset | null, Asset | null]>([null, null]);
  const envelope = await assets.select('*').in('id', ids);
  if (envelope.error) return failed();
  const rows = parseAssets(envelope.data);
  const before = rows.find((asset) => asset.id === event.before_asset_id) ?? null;
  const after = rows.find((asset) => asset.id === event.after_asset_id) ?? null;
  return ready<[Asset | null, Asset | null]>([before, after]);
}

/** `model_registry` is reference data, not tenant data. It is seeded with `forestry` as the only
 *  trained sector; every other sector reads `unsupported`, which is not zero. */
export async function listModelRegistry(): Promise<DataState<ModelRegistryEntry[]>> {
  const registry = table('model_registry');
  if (registry === null) return failed();
  const envelope = await registry.select('*').order('sector', true);
  if (envelope.error) return failed();
  return readyOrEmpty(parseModelRegistry(envelope.data));
}

/** Candidate before/after pairs for change detection, resolved server-side. */
export async function listPairingCandidates(projectId: string): Promise<DataState<PairingCandidate[]>> {
  const assets = table('assets');
  if (assets === null) return failed();
  const envelope = await rpc('assets_for_pairing', { p_project_id: projectId });
  if (envelope.error) return failed();
  const pairs = asArray(envelope.data)
    .map((entry) => {
      const record = asRecord(entry);
      if (record === null) return null;
      const before = parseAssets([record.before ?? record.before_asset])[0] ?? null;
      const after = parseAssets([record.after ?? record.after_asset])[0] ?? null;
      const project = requiredStr(record.project_id) ?? projectId;
      return before === null || after === null ? null : { projectId: project, before, after };
    })
    .filter((entry): entry is PairingCandidate => entry !== null);
  if (pairs.length === 0) {
    const fallback = await assets.select('*').eq('project_id', projectId).order('device_capture_timestamp', true);
    if (fallback.error) return failed();
    const rows = parseAssets(fallback.data);
    if (rows.length < 2) return readyOrEmpty<PairingCandidate>([]);
    return ready<PairingCandidate[]>([{ projectId, before: rows[0], after: rows[1] }]);
  }
  return ready<PairingCandidate[]>(pairs);
}

export function registryForSector(
  registry: ModelRegistryEntry[],
  sector: string | null,
): ModelRegistryEntry | null {
  if (sector === null) return null;
  return registry.find((entry) => entry.sector.toLowerCase() === sector.toLowerCase()) ?? null;
}

export function changeGeoDistance(event: ChangeEvent): number | null {
  return num(event.gps_distance_meters);
}

/** A paired change event has both `before_asset_id` and `after_asset_id` non-null. */
export async function countPairedChangeEvents(projectId: string | null): Promise<DataState<number>> {
  const events = table('change_events');
  if (events === null) return failed();
  let query = events.select('*').notNull('before_asset_id').notNull('after_asset_id');
  if (projectId !== null) query = query.eq('project_id', projectId);
  const envelope = await query.countExact();
  if (envelope.error) return failed();
  return envelope.count === null ? undetermined() : ready(envelope.count);
}
