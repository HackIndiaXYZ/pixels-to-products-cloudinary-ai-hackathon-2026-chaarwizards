/**
 * Per-org upload rate limiting (BUILD_ORDER Phase 11 "Rate limiting"; gate:
 * "rate limits are enforced per org").
 *
 * The capture app uploads directly to Cloudinary through an UNSIGNED preset, so
 * the webhook ingest is the first server-side surface that sees an org's upload
 * volume. Anyone holding the preset can push bytes, so a per-org ceiling on the
 * ingest path is the unsigned-preset abuse mitigation: a single org that floods
 * uploads is throttled without denying service to any OTHER tenant.
 *
 * The key is the `org_id` derived from the SIGNED `project_id` (never the body),
 * so a flood from one org can never consume another org's budget. That is the
 * property the gate asserts: org A trips `429`; org B is unaffected.
 *
 * This is a fixed-window counter kept in process memory. It is deliberately not
 * the same limiter as the per-user `@fastify/rate-limit` (which keys on the JWT
 * `userId` for the authenticated REST surface) — the webhook has no user, only a
 * derived org, and it needs an org-aggregate cap rather than a per-caller one.
 */

/** A per-org limiter decision. `retryAfterSeconds` is set only when blocked. */
export interface OrgRateDecision {
  readonly allowed: boolean;
  /** Seconds until the current window rolls over; `>= 1` when blocked. */
  readonly retryAfterSeconds: number;
  /** Requests already counted in the current window (including this one). */
  readonly count: number;
  /** The ceiling for the window. */
  readonly limit: number;
}

export interface OrgRateLimiter {
  /** Count one request for `orgId` and decide whether it is allowed. */
  hit(orgId: string): OrgRateDecision;
}

export interface InMemoryOrgRateLimiterOptions {
  /** Max requests per org per window. */
  readonly max: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
  /** Clock injection for deterministic tests. Defaults to `Date.now`. */
  readonly now?: () => number;
}

interface WindowState {
  count: number;
  /** Epoch ms at which the current window ends. */
  resetAt: number;
}

/**
 * A fixed-window per-org counter. Each org gets its own independent window, so
 * throttling one org never affects another (the multi-tenant fairness the gate
 * requires). Windows are created lazily and rolled over on the next hit after
 * they expire, so memory is bounded by the number of recently-active orgs.
 */
export function createInMemoryOrgRateLimiter(
  options: InMemoryOrgRateLimiterOptions,
): OrgRateLimiter {
  const { max, windowMs } = options;
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`org rate limit max must be a positive integer, got ${max}`);
  }
  if (!Number.isFinite(windowMs) || windowMs < 1) {
    throw new Error(`org rate limit windowMs must be >= 1, got ${windowMs}`);
  }
  const now = options.now ?? ((): number => Date.now());
  const windows = new Map<string, WindowState>();

  return {
    hit(orgId: string): OrgRateDecision {
      const t = now();
      let state = windows.get(orgId);
      if (state === undefined || t >= state.resetAt) {
        state = { count: 0, resetAt: t + windowMs };
        windows.set(orgId, state);
      }
      state.count += 1;
      const allowed = state.count <= max;
      // Round up so a caller never retries before the window actually rolls over.
      const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((state.resetAt - t) / 1000));
      return { allowed, retryAfterSeconds, count: state.count, limit: max };
    },
  };
}
