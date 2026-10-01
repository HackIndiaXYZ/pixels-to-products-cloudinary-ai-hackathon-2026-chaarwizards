/**
 * Project routes (api-contracts.md §4). List, create, get, get-tree, and update
 * config. Every handler resolves the caller from the verified JWT and scopes by
 * that org — `org_id` is never read from the body (AGENTS.md §3.4). Writes
 * require a role that may write (`member`+); `viewer` is read-only (§3.10).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, ProjectConfigSchema } from '@panchnama/shared';
import { errors } from '../types.js';
import { clampLimit } from '../lib/pagination.js';

const ListQuerySchema = z.object({
  limit: z.union([z.string(), z.number()]).optional(),
  cursor: z.string().optional(),
});

const CreateBodySchema = z
  .object({
    name: z.string().min(1),
    sector: z.string().min(1).nullable().optional(),
    start_date: z.iso.date().nullable().optional(),
    end_date: z.iso.date().nullable().optional(),
    config: ProjectConfigSchema.optional(),
    parent_project_id: z.uuid().nullable().optional(),
  })
  .strict();

const IdParamsSchema = z.object({ id: z.uuid() });

const RATE = { max: 100, timeWindow: '1 minute' } as const;

export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/projects', { config: { rateLimit: RATE } }, async (request) => {
    const ctx = app.authenticate(request);
    const q = ListQuerySchema.parse(request.query);
    const page = await app.deps.db.projects.list(ctx, {
      limit: clampLimit(q.limit),
      cursor: q.cursor ?? null,
    });
    return ok({ data: page.rows, next_cursor: page.nextCursor, total: page.rows.length });
  });

  app.post('/v1/projects', async (request, reply) => {
    const ctx = app.requireRole(request, 'platform_admin', 'org_admin', 'member');
    const body = CreateBodySchema.parse(request.body);
    const project = await app.deps.db.projects.create(ctx, {
      name: body.name,
      sector: body.sector ?? null,
      start_date: body.start_date ?? null,
      end_date: body.end_date ?? null,
      config: body.config ?? { observation_types: [] },
      parent_project_id: body.parent_project_id ?? null,
    });
    void reply.status(201);
    return ok(project);
  });

  app.get('/v1/projects/:id', async (request) => {
    const ctx = app.authenticate(request);
    const { id } = IdParamsSchema.parse(request.params);
    const project = await app.deps.db.projects.get(ctx, id);
    if (project === null) throw errors.notFound('project not found');
    return ok(project);
  });

  app.get('/v1/projects/:id/tree', async (request) => {
    const ctx = app.authenticate(request);
    const { id } = IdParamsSchema.parse(request.params);
    const tree = await app.deps.db.projects.tree(ctx, id);
    if (tree.length === 0) throw errors.notFound('project not found');
    return ok({ data: tree });
  });

  app.patch('/v1/projects/:id/config', async (request) => {
    const ctx = app.requireRole(request, 'platform_admin', 'org_admin', 'member');
    const { id } = IdParamsSchema.parse(request.params);
    const config = ProjectConfigSchema.parse(request.body);
    const updated = await app.deps.db.projects.updateConfig(ctx, id, config);
    if (updated === null) throw errors.notFound('project not found');
    return ok(updated);
  });
}
