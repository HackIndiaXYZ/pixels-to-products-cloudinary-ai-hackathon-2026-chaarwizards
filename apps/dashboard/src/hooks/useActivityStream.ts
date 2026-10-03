import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listAuditLogs, type AuditLogPage } from '../lib/queries/integrity';
import { toActivityEntryModel, type ActivityEntryModel } from '../lib/models';
import { getSupabase } from '../lib/supabase/client';
import { empty, ready, type DataState } from '../lib/state';
import { toDataState } from './useDataState';

export type ActivitySource = 'realtime' | 'polling';

export interface ActivityFeed {
  entries: ActivityEntryModel[];
  source: ActivitySource;
}

/** Every entry is a real `audit_logs` row: its own `hashed_at` timestamp, its own `asset_id`
 *  reference, and its own `action`. Supabase Realtime is used when the channel connects; otherwise
 *  TanStack Query invalidation drives the refresh, and the UI states which source is live. */
export function useActivityStream(assetId: string | null): {
  feed: DataState<ActivityFeed>;
  source: ActivitySource;
} {
  const queryClient = useQueryClient();
  const [source, setSource] = useState<ActivitySource>('polling');

  const query = useQuery({
    queryKey: ['activity', assetId],
    queryFn: () => listAuditLogs(assetId, 40),
    staleTime: 10_000,
    refetchInterval: source === 'polling' ? 20_000 : false,
  });

  useEffect(() => {
    const supabase = getSupabase();
    if (supabase === null) return undefined;
    const channel = supabase
      .channel('panchnama-audit-activity')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['activity', assetId] });
        },
      )
      .subscribe((status) => {
        setSource(status === 'SUBSCRIBED' ? 'realtime' : 'polling');
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [assetId, queryClient]);

  const state = toDataState<AuditLogPage>(query);
  if (state.status === 'empty') return { feed: empty<ActivityFeed>(), source };
  if (state.status !== 'ready') return { feed: state, source };
  const entries = state.data.rows.map(toActivityEntryModel);
  return {
    feed: entries.length === 0 ? empty<ActivityFeed>() : ready<ActivityFeed>({ entries, source }),
    source,
  };
}
