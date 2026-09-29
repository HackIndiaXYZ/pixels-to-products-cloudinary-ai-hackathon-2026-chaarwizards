import { describe, expect, it } from 'vitest';
import { toVerdict } from './verdict';

/**
 * AGENTS.md §3.7 — `unknown` must never be surfaced as `pass`. Only a genuine
 * `true` passes; a missing signal (`null`/`undefined`) is `unknown`.
 */
describe('toVerdict', () => {
  it('true → pass', () => {
    expect(toVerdict(true)).toBe('pass');
  });
  it('false → fail', () => {
    expect(toVerdict(false)).toBe('fail');
  });
  it('null → unknown (never pass)', () => {
    expect(toVerdict(null)).toBe('unknown');
  });
  it('undefined → unknown (never pass)', () => {
    expect(toVerdict(undefined)).toBe('unknown');
  });
});
