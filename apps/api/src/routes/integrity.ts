/**
 * Integrity endpoint (api-contracts.md §4). Returns the three-state result of
 * `verify_asset_integrity` for one asset, org-scoped by RLS. `unknown` is
 * reported as `unknown` and never rounded up to `pass` (AGENTS.md §3.7); only a
 * `fail` is a blocking failure.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '@impact/shared';
import { errors } from '../types.js';

const IdParamsSchema = z.object({ id: z.uuid() });

export async function registerIntegrityRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/assets/:id/integrity',
    { config: { rateLimit: { max: 100, timeWindow: '1 minute' } } },
    async (request) => {
      const ctx = app.authenticate(request);
      const { id } = IdParamsSchema.parse(request.params);

      // Confirm the asset is visible to this org before disclosing any check.
      const asset = await app.deps.db.assets.getById(ctx, id);
      if (asset === null) throw errors.notFound('asset not found');

      const checks = await app.deps.db.integrity.verify(ctx, id);
      const blocked = checks.some((c) => c.state === 'fail');
      return ok({
        asset_id: id,
        verification: asset.upload_status,
        blocked,
        checks,
      });
    },
  );
}
