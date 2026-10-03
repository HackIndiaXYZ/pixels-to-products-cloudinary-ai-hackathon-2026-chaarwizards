import { useQuery } from '@tanstack/react-query';
import type { Org } from '../types/database';
import { getOwnOrg } from '../lib/queries/auth';
import { getSyncHealth, type SyncHealth } from '../lib/queries/projects';
import type { DataState } from '../lib/state';
import { toDataState } from './useDataState';

export interface Workspace {
  org: DataState<Org>;
  sync: DataState<SyncHealth[]>;
}

/** The organisation is the `org_id` JWT claim, never a value supplied by the request body.
 *  System status comes from `sync_state.last_status`; there is no separate health table. */
export function useCurrentWorkspace(): Workspace {
  const org = useQuery({ queryKey: ['workspace', 'org'], queryFn: getOwnOrg, staleTime: 300_000 });
  const sync = useQuery({
    queryKey: ['workspace', 'sync-state'],
    queryFn: getSyncHealth,
    staleTime: 60_000,
  });
  return {
    org: toDataState(org),
    sync: toDataState(sync),
  };
}
