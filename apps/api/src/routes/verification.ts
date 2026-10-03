/**
 * Audit & integrity surfacing endpoints (Phase):
 *
 *   GET /v1/assets/:id/verify-chain    — structured chain verification for an
 *                                        asset (Chain verifier). Names the first
 *                                        tampered row or gap; feeds the dashboard
 *                                        chain visualization + exportable record.
 *   GET /v1/reports/:id/verification   — public-safe verification receipt for a
 *                                        report id (Report verification). Only
 *                                        hashes and timestamps; leaks no org_id,
 *                                        user identity, GPS, caption, or public_id.
 *
 * Both resolve strictly under the caller's RLS scope: a cross-org id is a 404,
 * never a disclosure . The receipt BODY is public-safe so it can
 * be exported and shared, but access to it is still gated by org membership.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '@panchnama/shared';
import { errors } from '../types.js';
import { verifyChain } from '../services/chain-verifier.js';

const AssetIdParamsSchema = z.object({ id: z.uuid() });
const ReportIdParamsSchema = z.object({ id: z.uuid() });
const RangeQuerySchema = z.object({
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
});

export async function registerVerificationRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/assets/:id/verify-chain',
    { config: { rateLimit: { max: 100, timeWindow: '1 minute' } } },
    async (request) => {
      const ctx = app.authenticate(request);
      const { id } = AssetIdParamsSchema.parse(request.params);
      const { from, to } = RangeQuerySchema.parse(request.query);

      // Resolve the asset under RLS first: a cross-org id is a 404, not a chain
      // verified over zero rows that a caller might mistake for a clean pass.
      const asset = await app.deps.db.assets.getById(ctx, id);
      if (asset === null) throw errors.notFound('asset not found');

      const result = await verifyChain(app.deps.db, ctx, id, from ?? null, to ?? null);
      return ok(result);
    },
  );

  app.get(
    '/v1/reports/:id/verification',
    { config: { rateLimit: { max: 100, timeWindow: '1 minute' } } },
    async (request) => {
      const ctx = app.authenticate(request);
      const { id } = ReportIdParamsSchema.parse(request.params);

      const receipt = await app.deps.db.reports.verificationReceipt(ctx, id);
      if (receipt === null) throw errors.notFound('report not found');
      return ok(receipt);
    },
  );
}
