/**
 * Integrity endpoint (api-contracts.md §4 "Get Asset with Integrity"). Returns
 * the documented flat contract: per-check tri-state booleans plus timing, where
 * a `null` is honestly `unknown` and never rounded up to `pass` (AGENTS.md §3.7).
 * The asset is resolved under RLS first, so a cross-org id is a 404 rather than a
 * disclosure of another org's checks.
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

      const contract = await app.deps.db.integrity.contract(ctx, id);
      if (contract === null) throw errors.notFound('asset not found');

      return ok(contract);
    },
  );
}
