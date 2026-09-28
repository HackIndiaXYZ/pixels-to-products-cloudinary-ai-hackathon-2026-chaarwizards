/**
 * HTTP client to the Python ML service (api-contracts.md §3).
 *
 * Every call mints a fresh short-TTL internal JWT — `sub`, `org_id`, `job_id`,
 * 120s HS256 — and sends it as a bearer token. A bare shared secret is never
 * sent (AGENTS.md §3.4): the per-call token gives the ML service an audit trail
 * and lets it reject cross-org work. The mint is exported on its own so it is
 * unit-testable without a live ML service.
 */
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { Config } from '../config.js';
import { errors } from '../types.js';

export const INTERNAL_JWT_TTL_SECONDS = 120;

export interface InternalJwtClaims {
  readonly sub: string;
  readonly org_id: string;
  readonly job_id: string;
}

/** Mint the 120s HS256 token the ML service verifies on every request. */
export function mintInternalJwt(secret: string, claims: InternalJwtClaims): string {
  return jwt.sign(
    { sub: claims.sub, org_id: claims.org_id, job_id: claims.job_id },
    secret,
    { algorithm: 'HS256', expiresIn: INTERNAL_JWT_TTL_SECONDS },
  );
}

const DetectChangeResponseSchema = z.object({
  change_type: z.string().optional(),
  change_metrics: z.record(z.string(), z.unknown()).optional(),
  confidence: z.number().optional(),
  diff_url: z.string().optional(),
  /**
   * The model_registry version that produced every number (§3.2). Present on a
   * successful detection; absent on the `{ "status": "unsupported" }` envelope a
   * sector with no trained model returns (§3.3).
   */
  model_version: z.string().optional(),
  status: z.string().optional(),
});
export type DetectChangeResponse = z.infer<typeof DetectChangeResponseSchema>;

export interface DetectChangeRequest {
  before_url: string;
  after_url: string;
  sector: string;
  project_id: string;
  gps_before?: { lat: number; lon: number };
  gps_after?: { lat: number; lon: number };
}

export interface MlClient {
  detectChange(
    ctx: { userId: string; orgId: string; jobId: string },
    req: DetectChangeRequest,
  ): Promise<DetectChangeResponse>;
}

export function createMlClient(config: Config, fetchImpl: typeof fetch = fetch): MlClient {
  return {
    async detectChange(ctx, req) {
      const token = mintInternalJwt(config.INTERNAL_JWT_SECRET, {
        sub: ctx.userId,
        org_id: ctx.orgId,
        job_id: ctx.jobId,
      });
      const res = await fetchImpl(`${config.ML_SERVICE_URL}/v1/detect-change`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        // Never swallow the failure — surface it with the upstream status (§3.6).
        throw errors.internal('ML service call failed', { status: res.status });
      }
      const json: unknown = await res.json();
      return DetectChangeResponseSchema.parse(json);
    },
  };
}
