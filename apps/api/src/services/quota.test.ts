import { describe, expect, it } from 'vitest';
import { assertWithinQuota, isOverQuota, quotaUsedFraction } from './quota.js';
import { HttpError } from '../types.js';

describe('quota enforcement', () => {
  it('admits an org below quota', () => {
    expect(() => assertWithinQuota({ quota_bytes: 100, bytes_used: 50 })).not.toThrow();
    expect(isOverQuota({ quota_bytes: 100, bytes_used: 50 })).toBe(false);
  });

  it('rejects an org at 100% with a 507', () => {
    try {
      assertWithinQuota({ quota_bytes: 100, bytes_used: 100 });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).statusCode).toBe(507);
      expect((err as HttpError).code).toBe('QUOTA_EXCEEDED');
    }
  });

  it('reports the used fraction', () => {
    expect(quotaUsedFraction({ quota_bytes: 200, bytes_used: 50 })).toBe(0.25);
  });
});
