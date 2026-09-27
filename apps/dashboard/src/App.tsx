import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CldImage } from './components/CldImage';

const queryClient = new QueryClient();

/**
 * Phase 0 app shell. Renders a single `CldImage` (via the official
 * `@cloudinary/react` `AdvancedImage`) to satisfy the Phase 0 gate.
 * Real routing, auth gate, and feature screens land in Phase 8.
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <main>
        <h1>Impact Media Intelligence</h1>
        <CldImage publicId="sample" alt="Cloudinary sample asset" width={400} />
      </main>
    </QueryClientProvider>
  );
}

export default App;
