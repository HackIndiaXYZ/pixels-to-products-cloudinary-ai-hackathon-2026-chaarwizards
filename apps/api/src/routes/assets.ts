/**
 * Asset delivery-URL routes (api-contracts.md §5, AGENTS.md §3.11).
 *
 * A client never supplies a `public_id`: it asks by `asset_id`, and the API
 * resolves the `public_id` under RLS. That closes the cross-org path where a
 * caller guesses another org's content hash — the asset lookup is org-scoped, so
 * an id outside the caller's org is a `404`.
 *
 * Originals are `type: authenticated` with a real-expiry `auth_token`;
 * derivatives are signed `type: upload` with no expiry, and the client-supplied
 * `transformation` must pass the allowlist or the request is `422`.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '@panchnama/shared';
import { errors } from '../types.js';
import { clampLimit } from '../lib/pagination.js';
import { rejectUnsafeTransformation } from '../lib/transformation-allowlist.js';

const IdParamsSchema = z.object({ id: z.uuid() });
const ProjectIdParamsSchema = z.object({ id: z.uuid() });

const OriginalBodySchema = z
  .object({ ttl_seconds: z.number().int().positive().max(3600).default(300) })
  .strict();

// `.strict()` rejects a smuggled `public_id`: the client asks by asset_id only.
const DerivativeBodySchema = z.object({ transformation: z.string().min(1) }).strict();

const ListQuerySchema = z.object({
  limit: z.union([z.string(), z.number()]).optional(),
  cursor: z.string().optional(),
});

export async function registerAssetRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/projects/:id/assets',
    { config: { rateLimit: { max: 200, timeWindow: '1 minute' } } },
    async (request) => {
      const ctx = app.authenticate(request);
      const { id } = ProjectIdParamsSchema.parse(request.params);
      const q = ListQuerySchema.parse(request.query);
      const page = await app.deps.db.assets.list(ctx, id, {
        limit: clampLimit(q.limit),
        cursor: q.cursor ?? null,
      });
      return ok({ data: page.rows, next_cursor: page.nextCursor, total: page.rows.length });
    },
  );

  app.post(
    '/v1/assets/:id/original-url',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request) => {
      const ctx = app.authenticate(request);
      const { id } = IdParamsSchema.parse(request.params);
      const body = OriginalBodySchema.parse(request.body ?? {});
      const asset = await app.deps.db.assets.getById(ctx, id);
      if (asset === null) throw errors.notFound('asset not found');
      const { url, expiresAt } = app.deps.cloudinary.originalUrl(
        asset.cloudinary_public_id,
        body.ttl_seconds,
      );
      return ok({ url, expires_at: expiresAt });
    },
  );

  app.post(
    '/v1/assets/:id/derivative-url',
    { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } },
    async (request) => {
      const ctx = app.authenticate(request);
      const { id } = IdParamsSchema.parse(request.params);
      const body = DerivativeBodySchema.parse(request.body);
      const offending = rejectUnsafeTransformation(body.transformation);
      if (offending !== null) {
        throw errors.unprocessable('transformation not allowed', { component: offending });
      }
      const asset = await app.deps.db.assets.getById(ctx, id);
      if (asset === null) throw errors.notFound('asset not found');
      const url = app.deps.cloudinary.signedDerivativeUrl(
        asset.cloudinary_public_id,
        body.transformation,
      );
      return ok({ url });
    },
  );
}
