import { describe, expect, it } from 'vitest';
import { createInMemoryOrgRateLimiter } from './org-rate-limit.js';

describe('per-org upload rate limiter (Phase 11)', () => {
  it('allows up to the limit, then blocks with a Retry-After', () => {
    const clock = 1_000_000;
    const limiter = createInMemoryOrgRateLimiter({ max: 2, windowMs: 60_000, now: () => clock });

    expect(limiter.hit('org-a').allowed).toBe(true);
    expect(limiter.hit('org-a').allowed).toBe(true);
    const blocked = limiter.hit('org-a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.limit).toBe(2);
    expect(blocked.count).toBe(3);
  });

  it('isolates orgs — one org tripping the limit does not affect another', () => {
    const limiter = createInMemoryOrgRateLimiter({ max: 1, windowMs: 60_000 });
    expect(limiter.hit('org-a').allowed).toBe(true);
    expect(limiter.hit('org-a').allowed).toBe(false); // org A tripped
    // org B has its own independent window and is unaffected.
    expect(limiter.hit('org-b').allowed).toBe(true);
  });

  it('rolls the window over once the window elapses', () => {
    let clock = 0;
    const limiter = createInMemoryOrgRateLimiter({ max: 1, windowMs: 1_000, now: () => clock });
    expect(limiter.hit('org-a').allowed).toBe(true);
    expect(limiter.hit('org-a').allowed).toBe(false);
    clock += 1_000; // window boundary reached
    expect(limiter.hit('org-a').allowed).toBe(true);
  });

  it('rejects a non-positive max or window', () => {
    expect(() => createInMemoryOrgRateLimiter({ max: 0, windowMs: 1000 })).toThrow();
    expect(() => createInMemoryOrgRateLimiter({ max: 5, windowMs: 0 })).toThrow();
  });
});
