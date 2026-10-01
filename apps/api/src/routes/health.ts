/**
 * Health probes. `GET /health` is a pure liveness check (the process is up);
 * `GET /health/ready` verifies the real dependencies — Postgres, Redis, and the
 * Cloudinary config — because a service that returns 200 while its database is
 * unreachable is worse than one that admits it is not ready.
 */
import type { FastifyInstance } from 'fastify';
import { ok } from '@panchnama/shared';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ok({ status: 'ok' }));

  app.get('/health/ready', async (_request, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = {
      db: 'ok',
      redis: 'ok',
      cloudinary: 'ok',
    };
    await Promise.all([
      app.deps.db.ping().catch(() => {
        checks.db = 'fail';
      }),
      app.deps.queue.ping().catch(() => {
        checks.redis = 'fail';
      }),
    ]);
    // Cloudinary readiness is config presence — a signing call needs no network.
    checks.cloudinary = app.deps.config.CLOUDINARY_API_SECRET.length > 0 ? 'ok' : 'fail';

    const ready = Object.values(checks).every((v) => v === 'ok');
    void reply.status(ready ? 200 : 503);
    return ok({ ready, checks });
  });
}
