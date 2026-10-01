import { describe, expect, it } from 'vitest';
import { UI_COMPONENTS_VERSION } from './index.js';

describe('@panchnama/ui-components skeleton', () => {
  it('exposes a package version constant', () => {
    expect(UI_COMPONENTS_VERSION).toBe('0.0.0');
  });
});
