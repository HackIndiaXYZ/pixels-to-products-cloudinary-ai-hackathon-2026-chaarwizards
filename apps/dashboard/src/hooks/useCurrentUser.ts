import { useQuery } from '@tanstack/react-query';
import type { DataState } from '../lib/state';
import { getCurrentUser, type CurrentUser } from '../lib/queries/auth';
import { toDataState } from './useDataState';

/** There is no `users` or `members` table. Identity comes from the Supabase auth session and
 *  authorisation from the hoisted `app_role` claim. */
export function useCurrentUser(): DataState<CurrentUser> {
  const query = useQuery({
    queryKey: ['session', 'current-user'],
    queryFn: getCurrentUser,
    staleTime: 60_000,
  });
  return toDataState(query);
}
