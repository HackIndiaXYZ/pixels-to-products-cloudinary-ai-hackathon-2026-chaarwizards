import type { QueryClient } from '@tanstack/react-query';
import type {
  RealtimePostgresChangesPayload,
  RealtimeChannel,
} from '@supabase/supabase-js';
import { supabase } from '../supabase/client';
import {
  invalidationKeysForEvent,
  type RealtimeEvent,
  type RealtimeTable,
} from './invalidation';

/**
 * Subscribe to Postgres row changes for the dashboard's tables and invalidate
 * the mapped query keys on each event (BUILD_ORDER Phase 8).
 *
 * The subscription only ever receives rows the caller's JWT can see — RLS is
 * enforced on the Realtime stream too — so a cross-org row never arrives here
 * and never triggers an invalidation. The event→key mapping is the pure,
 * unit-tested `invalidationKeysForEvent`; this helper is the thin adapter that
 * wires Supabase to it. Returns an unsubscribe function.
 */
export function subscribeRealtime(queryClient: QueryClient): () => void {
  const tables: RealtimeTable[] = ['assets', 'change_events'];

  const channel: RealtimeChannel = supabase.channel('dashboard-realtime');

  for (const table of tables) {
    channel.on(
      // The Supabase types model this string literal loosely; the payload is
      // narrowed below.
      'postgres_changes' as never,
      { event: '*', schema: 'public', table } as never,
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const event: RealtimeEvent = {
          table,
          eventType: payload.eventType,
          new:
            payload.eventType === 'DELETE'
              ? null
              : (payload.new as Record<string, unknown>),
          old:
            'old' in payload && payload.old
              ? (payload.old as Record<string, unknown>)
              : null,
        };
        for (const key of invalidationKeysForEvent(event)) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      },
    );
  }

  void channel.subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
