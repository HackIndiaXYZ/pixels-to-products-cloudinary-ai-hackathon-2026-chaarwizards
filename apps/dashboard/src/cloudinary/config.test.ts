import { describe, expect, it } from 'vitest';
import { CLOUD_NAME, cld } from './config';

describe('dashboard cloudinary config', () => {
  it('builds https delivery URLs via @cloudinary/url-gen (no hand-rolled strings)', () => {
    const url = cld.image('sample').toURL();
    expect(url.startsWith('https://')).toBe(true);
    expect(url).toContain(CLOUD_NAME);
    expect(url).toContain('sample');
  });
});
