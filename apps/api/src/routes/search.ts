/**
 * Global search (api-contracts.md §4 "Global Search"). The seven facets are
 * parsed from the query string, an unset facet is simply omitted so the filters
 * compose, and the query runs through the `search_assets` SQL function — which
 * is SECURITY INVOKER, so `assets` RLS scopes the result to the caller's org
 * (AGENTS.md §3.9). Postgres is the system of record; this never touches the
 * Cloudinary Search API, which has no org filter and would leak across tenants.
 *
 * `total_matched` and `facet_counts` are computed over the full match set, not
 * the returned page, and a match set larger than 1000 sets `truncated: true`.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '@panchnama/shared';
import { errors } from '../types.js';
import { clampLimit } from '../lib/pagination.js';
import type { SearchFilters } from '../ports.js';

const SearchQuerySchema = z.object({
  q: z.string().optional(),
  bbox: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  tags: z.string().optional(),
  gps_accuracy_max: z.coerce.number().optional(),
  asset_type: z.enum(['image', 'video']).optional(),
  phase: z.enum(['before', 'after']).optional(),
  limit: z.union([z.string(), z.number()]).optional(),
  cursor: z.string().optional(),
});

/** Parse `minLon,minLat,maxLon,maxLat` into a validated tuple, or 400. */
function parseBbox(raw: string): [number, number, number, number] {
  const parts = raw.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw errors.validation('bbox must be four numbers: minLon,minLat,maxLon,maxLat');
  }
  return [parts[0] as number, parts[1] as number, parts[2] as number, parts[3] as number];
}

export async function registerSearchRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/v1/search',
    { config: { rateLimit: { max: 50, timeWindow: '1 minute' } } },
    async (request) => {
      const ctx = app.authenticate(request);
      const q = SearchQuerySchema.parse(request.query);

      const filters: SearchFilters = {
        ...(q.q !== undefined && q.q !== '' ? { q: q.q } : {}),
        ...(q.bbox !== undefined ? { bbox: parseBbox(q.bbox) } : {}),
        ...(q.date_from !== undefined ? { dateFrom: q.date_from } : {}),
        ...(q.date_to !== undefined ? { dateTo: q.date_to } : {}),
        ...(q.tags !== undefined && q.tags !== ''
          ? { tags: q.tags.split(',').map((t) => t.trim()).filter((t) => t !== '') }
          : {}),
        ...(q.gps_accuracy_max !== undefined ? { gpsAccuracyMax: q.gps_accuracy_max } : {}),
        ...(q.asset_type !== undefined ? { assetType: q.asset_type } : {}),
        ...(q.phase !== undefined ? { phase: q.phase } : {}),
      };

      const result = await app.deps.db.assets.searchAssets(ctx, filters, {
        limit: clampLimit(q.limit),
        cursor: q.cursor ?? null,
      });

      return ok({
        data: result.rows,
        total_matched: result.totalMatched,
        truncated: result.truncated,
        facet_counts: result.facetCounts,
        next_cursor: result.nextCursor,
      });
    },
  );
}
