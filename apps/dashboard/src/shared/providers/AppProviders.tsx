import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth/AuthContext';
import { RealtimeBridge } from '../realtime/RealtimeBridge';

/**
 * Root providers: one TanStack Query client, the auth context, and the Realtime
 * bridge that invalidates queries on Postgres row changes (BUILD_ORDER
 * Phase 8). The QueryClient is created once via `useState` so it survives
 * re-renders without being recreated.
 */
export function AppProviders({ children }: { readonly children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeBridge />
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
