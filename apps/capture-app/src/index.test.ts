import { describe, expect, it } from 'vitest';
import { CAPTURE_APP_VERSION, captureAppBanner } from './index.js';

describe('@panchnama/capture-app skeleton', () => {
  it('exposes a package version constant', () => {
    expect(CAPTURE_APP_VERSION).toBe('0.0.0');
  });

  it('reports a banner that references the shared package', () => {
    expect(captureAppBanner()).toContain('shared');
  });
});
