import { afterEach, expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';

// Register jest-dom matchers on Vitest's `expect` explicitly. The
// `@testing-library/jest-dom/vitest` side-effect entry can miss the global
// `expect` under some worker pools, so we extend it directly and
// deterministically here.
expect.extend(matchers);

// Unmount and clean the DOM between tests so component state never leaks.
afterEach(() => {
  cleanup();
});
