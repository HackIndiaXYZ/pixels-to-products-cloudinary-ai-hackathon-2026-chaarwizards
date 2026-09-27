import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES, fail, isApiFailure, ok } from './envelope.js';

describe('API envelope', () => {
  it('ok() sets data and a null error', () => {
    const env = ok({ id: 1 });
    expect(env).toEqual({ data: { id: 1 }, error: null });
    expect(isApiFailure(env)).toBe(false);
  });

  it('fail() sets a null data and a typed error', () => {
    const env = fail('NOT_FOUND', 'no such asset');
    expect(env.data).toBeNull();
    expect(env.error.code).toBe('NOT_FOUND');
    expect(isApiFailure(env)).toBe(true);
  });

  it('fail() carries optional details and omits the key when absent', () => {
    const withDetails = fail('VALIDATION_ERROR', 'bad input', { field: 'name' });
    expect(withDetails.error.details).toEqual({ field: 'name' });

    const withoutDetails = fail('INTERNAL_ERROR', 'boom');
    expect(withoutDetails.error).not.toHaveProperty('details');
  });

  it('exposes the documented error codes', () => {
    for (const code of ['VALIDATION_ERROR', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'INTERNAL_ERROR']) {
      expect(API_ERROR_CODES).toContain(code);
    }
  });

  it('narrows an envelope through the failure guard', () => {
    const env = Math.random() < -1 ? ok('never') : fail('RATE_LIMITED', 'slow down');
    if (isApiFailure(env)) {
      expect(env.error.code).toBe('RATE_LIMITED');
    } else {
      throw new Error('expected a failure envelope');
    }
  });
});
