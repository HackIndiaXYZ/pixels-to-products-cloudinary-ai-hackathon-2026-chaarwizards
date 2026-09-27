import { describe, expect, it } from 'vitest';
import { API_PACKAGE_VERSION, apiBanner } from './index.js';

describe('@impact/api skeleton', () => {
  it('exposes a package version constant', () => {
    expect(API_PACKAGE_VERSION).toBe('0.0.0');
  });

  it('reports a banner that references the shared package', () => {
    expect(apiBanner()).toContain('shared');
  });
});
