/**
 * Native adapter: device clocks (Phase; system invariants).
 *
 * `now()` is wall-clock epoch ms and `monotonicMs()` is a monotonic counter that
 * a wall-clock adjustment cannot move backwards. Keeping them separate is what
 * lets the server tell dwell from clock skew (§3.7) — the monotonic value is
 * signed into the capture payload as `device_monotonic_ms`.
 */
import type { Clock } from '../ports.js';

export class DeviceClock implements Clock {
  now(): number {
    return Date.now();
  }

  monotonicMs(): number {
    // `performance.now()` is monotonic on RN (Hermes); fall back to `Date.now()`
    // only if it is somehow unavailable, which at worst degrades to wall-clock.
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? Math.round(performance.now())
      : Date.now();
  }
}
