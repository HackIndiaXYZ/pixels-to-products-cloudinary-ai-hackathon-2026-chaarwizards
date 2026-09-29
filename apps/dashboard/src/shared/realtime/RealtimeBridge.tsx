import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { subscribeRealtime } from './subscribe';

/**
 * Wires Supabase Realtime to TanStack Query while the user is authenticated.
 * Renders nothing. Subscribing only when a session exists means no channel is
 * opened for a signed-out visitor, and RLS scopes the stream to the caller's
 * org so a cross-org row never reaches the invalidation mapping (§3.4).
 */
export function RealtimeBridge() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  useEffect(() => {
    if (session === null) {
      return;
    }
    const unsubscribe = subscribeRealtime(queryClient);
    return unsubscribe;
  }, [queryClient, session]);

  return null;
}
