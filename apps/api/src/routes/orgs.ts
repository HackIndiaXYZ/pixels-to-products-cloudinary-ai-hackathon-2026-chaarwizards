/**
 * Org provisioning (api-contracts.md §5, AGENTS.md §3.10). There is no public
 * signup: only a `platform_admin` may create an org, and doing so mints a
 * single-use, 72-hour invite for the first `org_admin`. The raw invite token is
 * returned exactly once, in the `invite_url`; only its SHA-256 is stored, so the
 * database never holds a redeemable secret.
 */
import { randomBytes, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, ORG_TYPES } from '@impact/shared';

const CreateOrgSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(ORG_TYPES).optional(),
    // Email to invite as the first org_admin. Optional; without it no invite is minted.
    admin_email: z.email().optional(),
  })
  .strict();

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export async function registerOrgRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/v1/orgs',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request) => {
      // platform_admin only. Any other role — or no token — is rejected before
      // any write happens.
      app.requireRole(request, 'platform_admin');
      const body = CreateOrgSchema.parse(request.body);

      const org = await app.deps.db.orgs.create({ name: body.name, type: body.type ?? null });

      let inviteUrl: string | null = null;
      if (body.admin_email !== undefined) {
        const rawToken = randomBytes(32).toString('base64url');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
        await app.deps.db.invites.create({
          org_id: org.id,
          email: body.admin_email,
          role: 'org_admin',
          token_hash: tokenHash,
          expires_at: expiresAt,
        });
        inviteUrl = `${app.deps.config.DASHBOARD_URL}/invite/${rawToken}`;
      }

      return ok({ org_id: org.id, invite_url: inviteUrl });
    },
  );
}
