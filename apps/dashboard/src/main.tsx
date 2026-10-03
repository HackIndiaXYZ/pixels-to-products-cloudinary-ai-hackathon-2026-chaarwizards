import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { isHarnessState, ReviewHarness } from './harness/ReviewHarness';
import './styles/tokens.css';
import './styles/components.css';
import 'maplibre-gl/dist/maplibre-gl.css';

/** Retries are off by default: every service already returns a typed `DataState`, so a silent retry
 *  would hide a real failure behind a slower screen. Callers opt in through `useQuery`. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: true, staleTime: 30_000 },
  },
});

const container = document.getElementById('root');
if (container === null) throw new Error('index.html is missing its #root element.');

/* One root entry, two modes. `?state=` opens the review harness for a single honest state; with no
   parameter the same file boots the live application. */
const requested = new URLSearchParams(window.location.search).get('state');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      {isHarnessState(requested) === true ? (
        <ReviewHarness state={requested} />
      ) : (
        <QueryClientProvider client={queryClient}>
          <HashRouter>
            <App />
          </HashRouter>
        </QueryClientProvider>
      )}
    </ErrorBoundary>
  </StrictMode>,
);