/**
 * Report endpoints (api-contracts.md §Reports, BUILD_ORDER Phase 9):
 *   POST /v1/reports/generate    — synchronous generate; returns report + manifest
 *   GET  /v1/report-templates    — list templates (built-in + org-authored)
 *
 * Generation is member+ only (a viewer is read-only, §3.10). Every id in the
 * body is resolved under the caller's RLS scope; `org_id` comes only from the
 * verified JWT, never the body (§3.4).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '@impact/shared';
import { generateReport } from '../services/report-generation.js';
import { listBuiltInTemplates } from '../reports/templates.js';

const GenerateBodySchema = z.object({
  project_id: z.uuid(),
  template_id: z.string().min(1),
  change_event_ids: z.array(z.uuid()).min(1),
  include_integrity_appendix: z.boolean().default(true),
});

const TemplatesQuerySchema = z.object({ sector: z.string().min(1).optional() });

export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/v1/reports/generate',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      // member+ (viewer is read-only §3.10).
      const ctx = app.requireRole(request, 'platform_admin', 'org_admin', 'member');
      const body = GenerateBodySchema.parse(request.body);

      const result = await generateReport(
        {
          db: app.deps.db,
          cloudinary: app.deps.cloudinary,
          renderer: app.deps.renderer,
          fetchBytes: app.deps.fetchBytes ?? defaultFetchBytes,
          fontCss: app.deps.reportFontCss ?? '',
          queue: app.deps.queue,
          now: () => new Date(),
        },
        ctx,
        {
          projectId: body.project_id,
          templateId: body.template_id,
          changeEventIds: body.change_event_ids,
          includeIntegrityAppendix: body.include_integrity_appendix,
        },
      );
      return ok(result);
    },
  );

  app.get(
    '/v1/report-templates',
    { config: { rateLimit: { max: 100, timeWindow: '1 minute' } } },
    async (request) => {
      const ctx = app.authenticate(request);
      const { sector } = TemplatesQuerySchema.parse(request.query);

      // Built-in templates plus any the org authored (RLS-scoped).
      const builtIn = listBuiltInTemplates(sector).map((t) => ({
        id: t.key,
        name: t.name,
        sector: t.sector,
        version: t.version,
        built_in: true,
      }));
      const custom = (await app.deps.db.reports.listTemplates(ctx, sector)).map((t) => ({
        id: t.id,
        name: t.name,
        sector: t.sector,
        version: null,
        built_in: false,
      }));
      return ok({ data: [...builtIn, ...custom] });
    },
  );
}

/** Fetch bytes over HTTP for inlining. Injected in tests; this is the default. */
async function defaultFetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed (${res.status}) for report media`);
  }
  return Buffer.from(await res.arrayBuffer());
}
