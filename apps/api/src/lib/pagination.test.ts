import { describe, expect, it } from 'vitest';
import { clampLimit, decodeCursor, encodeCursor, MAX_LIMIT } from './pagination.js';
import { HttpError } from '../types.js';

describe('pagination', () => {
  it('defaults a missing limit to 20', () => {
    expect(clampLimit(undefined)).toBe(20);
  });

  it('clamps limit above the cap to 100, not rejecting it', () => {
    expect(clampLimit(500)).toBe(MAX_LIMIT);
    expect(clampLimit('1000')).toBe(MAX_LIMIT);
  });

  it('floors a value below 1 to 1', () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-5)).toBe(1);
  });

  it('round-trips a cursor', () => {
    expect(decodeCursor(encodeCursor(40))).toBe(40);
  });

  it('rejects a malformed cursor with a 400', () => {
    expect(() => decodeCursor('not-base64-json')).toThrow(HttpError);
  });
});
