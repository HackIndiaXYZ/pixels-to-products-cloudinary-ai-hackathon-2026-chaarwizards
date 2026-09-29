/**
 * Read endpoints the dashboard needs but that had no Node handler yet
 * (api-contracts.md §4): a project's change events, and an asset's derivative
 * lineage. Both resolve strictly under the caller's RLS scope — org isolation is
 * the database's job, and a cross-org id returns an empty list or a 404, never
 * another org's rows (AGENTS.md §3.4).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '@impact/shared';
import { errors } from '../types.js';
import { clampLimit } from '../lib/pagination.js';

const ProjectIdParamsSchema = z.object({ id: z.uuid() });
const AssetIdParamsSchema = z.object({ id: z.uuid() });
const ListQuerySchema = z.object({
  limit: z.union([z.string(), z.number()]).optional(),
  cursor: z.string().optional(),
});

export async function registerReadRoutes(app: FastifyInstance): Promise<void> {
  // A project's change events (org-scoped, newest first).
  app.get(
    '/v1/projects/:id/change-events',
    { config: { rateLimit: { max: 100, timeWindow: '1 minute' } } },
    async (request) => {
      const ctx = app.authenticate(request);
      const { id } = ProjectIdParamsSchema.parse(request.params);
      const query = ListQuerySchema.parse(request.query);

      // Confirm the project is visible to this org before listing under it.
      const project = await app.deps.db.projects.get(ctx, id);
      if (project === null) throw errors.notFound('project not found');

      const page = await app.deps.db.changeEvents.listByProject(ctx, id, {
        limit: clampLimit(query.limit),
        cursor: query.cursor ?? null,
      });
      return ok({ data: page.rows, next_cursor: page.nextCursor });
    },
  );

  // An asset's append-only derivative lineage (§3.1). Every row carries the
  // exact `transformation` string and `is_generative`.
  app.get(
    '/v1/assets/:id/derivatives',
    { config: { rateLimit: { max: 200, timeWindow: '1 minute' } } },
    async (request) => {
      const ctx = app.authenticate(request);
      const { id } = AssetIdParamsSchema.parse(request.params);

      // Resolve the parent under RLS first: a cross-org id is a 404, not an
      // empty list that could be mistaken for "no derivatives".
      const asset = await app.deps.db.assets.getById(ctx, id);
      if (asset === null) throw errors.notFound('asset not found');

      const derivatives = await app.deps.db.derivatives.listByParent(ctx, id);
      return ok({ data: derivatives });
    },
  );
}
