import { queryKeys } from '../queryKeys';

/**
 * Realtime → query-key invalidation mapping.
 *
 * Supabase Realtime streams Postgres row changes. When one arrives the UI must
 * invalidate *exactly* the queries whose data it affects — no more (which would
 * thrash the network) and no less (which serves stale rows that look correct).
 * BUILD_ORDER Phase 8 makes this a gate: an unmapped event silently serves
 * stale data, so the mapping is pure, exported, and unit-tested rather than
 * hand-wired inside a subscription callback.
 *
 * The returned arrays are query-key *prefixes*: TanStack Query invalidates any
 * cached query whose key starts with the prefix, so invalidating
 * `['projects', p, 'assets']` clears every filtered asset list for that project
 * regardless of its facet arguments.
 */

/** The Postgres tables the dashboard subscribes to. */
export type RealtimeTable = 'assets' | 'change_events';

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

/** A minimal, typed view of a Supabase `postgres_changes` payload. */
export interface RealtimeEvent {
  readonly table: RealtimeTable;
  readonly eventType: RealtimeEventType;
  /** The new row (INSERT/UPDATE) — RLS guarantees it is in the caller's org. */
  readonly new: Readonly<Record<string, unknown>> | null;
  /** The previous row (UPDATE/DELETE). */
  readonly old: Readonly<Record<string, unknown>> | null;
}

/** A query-key prefix to invalidate. */
export type InvalidationKey = readonly unknown[];

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Map one Realtime event to the set of query-key prefixes to invalidate.
 * Returns `[]` for an event that affects nothing the dashboard caches, so an
 * unrecognised shape is an explicit no-op rather than a blanket refresh.
 */
export function invalidationKeysForEvent(event: RealtimeEvent): InvalidationKey[] {
  const row = event.new ?? event.old;
  if (row === null) {
    return [];
  }
  const projectId = str(row['project_id']);
  const assetId = str(row['id']);

  if (event.table === 'assets') {
    const keys: InvalidationKey[] = [];
    if (projectId !== null) {
      // Any filtered asset list for this project, and the admin quarantine
      // queue (a flagged asset must appear/disappear there).
      keys.push(queryKeys.projects.assets(projectId));
      keys.push(queryKeys.admin.quarantine(projectId));
    }
    // The global admin queue and global search span projects.
    keys.push(queryKeys.admin.quarantine());
    keys.push(['search']);
    if (assetId !== null) {
      // Integrity/lineage panels for the specific asset.
      keys.push(queryKeys.assets.integrity(assetId));
      keys.push(queryKeys.assets.derivatives(assetId));
      keys.push(queryKeys.assets.auditTrail(assetId));
    }
    return keys;
  }

  if (event.table === 'change_events') {
    if (projectId !== null) {
      return [queryKeys.projects.changeEvents(projectId)];
    }
    return [];
  }

  return [];
}
