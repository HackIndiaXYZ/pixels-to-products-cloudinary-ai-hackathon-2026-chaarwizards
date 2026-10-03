import type { Project } from '../../types/database';
import { failed, ready, readyOrEmpty, undetermined, type DataState } from '../state';
import { table } from '../supabase/client';
import { asArray, asRecord, parseProject, parseProjects } from './parse';

export async function listProjects(): Promise<DataState<Project[]>> {
  const projects = table('projects');
  if (projects === null) return failed();
  const envelope = await projects.select('*').order('start_date', false).limit(200);
  if (envelope.error) return failed();
  return readyOrEmpty(parseProjects(envelope.data));
}

export async function getProject(projectId: string): Promise<DataState<Project>> {
  const projects = table('projects');
  if (projects === null) return failed();
  const envelope = await projects.select('*').eq('id', projectId).limit(1);
  if (envelope.error) return failed();
  const record = asRecord(Array.isArray(envelope.data) ? envelope.data[0] : envelope.data);
  const project = record === null ? null : parseProject(record);
  return project === null ? undetermined() : ready(project);
}

/** Exact number of `assets` rows belonging to one project. The filter runs in PostgREST under
 *  row-level security and the number comes back in `Content-Range`, so this is the project's real
 *  asset total rather than the length of whichever page happens to be loaded. A count that cannot
 *  be determined resolves to `unknown` — never `0`, which would read as an empty project. */
export async function countProjectAssets(projectId: string): Promise<DataState<number>> {
  const assets = table('assets');
  if (assets === null) return failed();
  const envelope = await assets.select('*').eq('project_id', projectId).countExact();
  if (envelope.error) return failed();
  return envelope.count === null ? undetermined() : ready(envelope.count);
}

export interface SyncHealth {
  scope: string;
  lastRunAt: string | null;
  lastStatus: string | null;
}

/** System status for the header comes from `sync_state.last_status`, never from an invented
 *  health value. */
export async function getSyncHealth(): Promise<DataState<SyncHealth[]>> {
  const sync = table('sync_state');
  if (sync === null) return failed();
  const envelope = await sync.select('*').order('scope', true).limit(20);
  if (envelope.error) return failed();
  const rows = asArray(envelope.data)
    .map((row) => asRecord(row))
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row) => ({
      scope: typeof row.scope === 'string' ? row.scope : 'Unknown',
      lastRunAt: typeof row.last_run_at === 'string' ? row.last_run_at : null,
      lastStatus: typeof row.last_status === 'string' ? row.last_status : null,
    }));
  /* An empty `sync_state` read is `empty`, never `ready([])` — the same rule every other list
     service follows, so the header distinguishes "no sync rows" from "rows present". */
  return readyOrEmpty(rows);
}
