import { describe, expect, it } from 'vitest';
import { SHARED_PACKAGE_VERSION } from './index.js';

describe('@impact/shared skeleton', () => {
  it('exposes a package version constant', () => {
    expect(SHARED_PACKAGE_VERSION).toBe('0.0.0');
  });
});
