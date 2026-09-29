import { describe, expect, it } from 'vitest';
import { invalidationKeysForEvent, type RealtimeEvent } from './invalidation';

/**
 * BUILD_ORDER Phase 8 gate — "Realtime invalidation is mapped, not guessed."
 * A `ready` asset event must invalidate exactly the right query keys; an
 * unmapped event silently serves stale data that looks correct.
 */
describe('invalidationKeysForEvent', () => {
  it('a verified (ready) asset invalidates that project’s asset lists, its quarantine queue, search, and the asset’s own panels', () => {
    const event: RealtimeEvent = {
      table: 'assets',
      eventType: 'UPDATE',
      new: { id: 'asset-1', project_id: 'proj-1', upload_status: 'verified' },
      old: { id: 'asset-1', project_id: 'proj-1', upload_status: 'pending' },
    };
    const keys = invalidationKeysForEvent(event);

    expect(keys).toContainEqual(['projects', 'proj-1', 'assets', {}]);
    expect(keys).toContainEqual(['admin', 'quarantine', 'proj-1']);
    expect(keys).toContainEqual(['admin', 'quarantine']);
    expect(keys).toContainEqual(['search']);
    expect(keys).toContainEqual(['assets', 'asset-1', 'integrity']);
    expect(keys).toContainEqual(['assets', 'asset-1', 'derivatives']);
    expect(keys).toContainEqual(['assets', 'asset-1', 'audit-trail']);
  });

  it('does NOT invalidate change-events for an asset event (no over-invalidation)', () => {
    const event: RealtimeEvent = {
      table: 'assets',
      eventType: 'INSERT',
      new: { id: 'a', project_id: 'p' },
      old: null,
    };
    const keys = invalidationKeysForEvent(event);
    expect(keys).not.toContainEqual(['projects', 'p', 'change-events']);
  });

  it('a change_events row invalidates only that project’s change-events list', () => {
    const event: RealtimeEvent = {
      table: 'change_events',
      eventType: 'INSERT',
      new: { id: 'ce-1', project_id: 'proj-9' },
      old: null,
    };
    expect(invalidationKeysForEvent(event)).toEqual([['projects', 'proj-9', 'change-events']]);
  });

  it('an event with no resolvable row is an explicit no-op, not a blanket refresh', () => {
    const event: RealtimeEvent = {
      table: 'assets',
      eventType: 'DELETE',
      new: null,
      old: null,
    };
    expect(invalidationKeysForEvent(event)).toEqual([]);
  });

  it('a DELETE uses the old row to still target the right project', () => {
    const event: RealtimeEvent = {
      table: 'change_events',
      eventType: 'DELETE',
      new: null,
      old: { id: 'ce-2', project_id: 'proj-2' },
    };
    expect(invalidationKeysForEvent(event)).toEqual([['projects', 'proj-2', 'change-events']]);
  });
});
