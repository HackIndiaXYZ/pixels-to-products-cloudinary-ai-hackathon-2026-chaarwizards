/**
 * Manual pairing override (BUILD_ORDER Phase 7 "Manual override"). A reviewer
 * can link two assets into a before/after pair, or split an existing pair that
 * the automated worker got wrong. Both actions append to the audit chain.
 *
 * Isolation (Phase 7 gate): every id is resolved under the caller's RLS scope.
 * A crafted id from another org resolves to null and returns 404 — never a
 * silent success, which would be a privilege-escalation path (§3.4). org_id is
 * taken from the verified JWT, never the body.
 *
 * A manual link carries NO CV metric: change_metrics is empty and model_version
 * is the 'manual' sentinel (§3.2 — no number is attributed to a model here).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '@panchnama/shared';
import { errors } from '../types.js';

const LinkBodySchema = z
  .object({
    before_asset_id: z.uuid(),
    after_asset_id: z.uuid(),
  })
  .strict();

const IdParamsSchema = z.object({ id: z.uuid() });

const RATE = { max: 60, timeWindow: '1 minute' } as const;

function timeDiffHours(beforeTs: string, afterTs: string): number | null {
  const b = Date.parse(beforeTs);
  const a = Date.parse(afterTs);
  if (Number.isNaN(b) || Number.isNaN(a)) return null;
  return Number(((a - b) / 3_600_000).toFixed(4));
}

export async function registerPairRoutes(app: FastifyInstance): Promise<void> {
  // Link two assets into a manual before/after pair.
  app.post('/v1/pairs', { config: { rateLimit: RATE } }, async (request, reply) => {
    const ctx = app.requireRole(request, 'platform_admin', 'org_admin', 'member');
    const body = LinkBodySchema.parse(request.body);
    if (body.before_asset_id === body.after_asset_id) {
      throw errors.validation('before_asset_id and after_asset_id must differ');
    }

    // Resolve BOTH under RLS. A cross-org id is invisible → 404, not a leak.
    const before = await app.deps.db.assets.getById(ctx, body.before_asset_id);
    const after = await app.deps.db.assets.getById(ctx, body.after_asset_id);
    if (before === null || after === null) {
      throw errors.notFound('asset not found');
    }
    if (before.project_id !== after.project_id) {
      throw errors.validation('both assets must belong to the same project');
    }

    const changeEvent = await app.deps.db.changeEvents.createManual(ctx, {
      project_id: before.project_id,
      before_asset_id: before.id,
      after_asset_id: after.id,
      gps_distance_meters: null,
      time_difference_hours: timeDiffHours(
        before.device_capture_timestamp,
        after.device_capture_timestamp,
      ),
    });

    await app.deps.db.audit.append({
      assetId: after.id,
      action: 'pair',
      actorType: 'user',
      actorId: ctx.userId,
      details: {
        change_event_id: changeEvent.id,
        before_asset_id: before.id,
        after_asset_id: after.id,
        method: 'manual_link',
      },
    });

    void reply.status(201);
    return ok(changeEvent);
  });

  // Split (unlink) an existing pair.
  app.post('/v1/pairs/:id/split', { config: { rateLimit: RATE } }, async (request) => {
    const ctx = app.requireRole(request, 'platform_admin', 'org_admin', 'member');
    const { id } = IdParamsSchema.parse(request.params);

    // Resolve under RLS first: another org's pair id is a 404 (Phase 7 gate).
    const existing = await app.deps.db.changeEvents.getById(ctx, id);
    if (existing === null) throw errors.notFound('pair not found');

    const updated = await app.deps.db.changeEvents.setStatus(ctx, id, 'split');
    if (updated === null) throw errors.notFound('pair not found');

    await app.deps.db.audit.append({
      assetId: updated.after_asset_id ?? existing.after_asset_id ?? id,
      action: 'split',
      actorType: 'user',
      actorId: ctx.userId,
      details: {
        change_event_id: id,
        before_asset_id: updated.before_asset_id ?? null,
        after_asset_id: updated.after_asset_id ?? null,
        method: 'manual_split',
      },
    });

    return ok(updated);
  });
}
