/**
 * Fastify app factory. Every external dependency is injected through
 * {@link AppDeps} so the app can be driven by in-memory fakes in tests and by
 * Supabase / Cloudinary / BullMQ in production. The plugin layout mirrors
 * `FILE_STRUCTURE.md`: auth, db, cloudinary, queue, routes.
 *
 * Cross-cutting guarantees wired here:
 * - a `request_id` on every response and every log line (AGENTS.md §3.6);
 * - a single typed error handler that maps {@link HttpError} to the `{data,error}`
 *   envelope and never leaks a stack or a secret;
 * - the caller identity comes only from the verified JWT (AGENTS.md §3.4).
 */
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { fail, type Role } from '@impact/shared';
import type { Config } from './config.js';
import type { CloudinaryPort, DbPort, QueuePort } from './ports.js';
import type { MlClient } from './services/ml-client.js';
import { HttpError, errors, type AuthContext } from './types.js';
import { extractBearer, verifySupabaseJwt } from './plugins/auth.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerOrgRoutes } from './routes/orgs.js';
import { registerIntegrityRoutes } from './routes/integrity.js';
import { registerCloudinaryWebhook } from './routes/webhooks/cloudinary.js';

export interface AppDeps {
  config: Config;
  db: DbPort;
  cloudinary: CloudinaryPort;
  queue: QueuePort;
  ml: MlClient;
  /**
   * Fetch the delivered original bytes so the webhook can independently re-hash
   * them (AGENTS.md §3.4). Injected for testability; defaults to `fetch` in
   * production wiring. When absent, the byte re-hash check reports `unknown`
   * rather than a false `pass` (AGENTS.md §3.7).
   */
  fetchBytes?: (url: string) => Promise<Buffer>;
  /** Disable the rate limiter (tests). Defaults to enabled. */
  rateLimitEnabled?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyInstance {
    deps: AppDeps;
    authenticate: (request: FastifyRequest) => AuthContext;
    requireRole: (request: FastifyRequest, ...roles: Role[]) => AuthContext;
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: deps.config.LOG_LEVEL,
      // Never let a secret or GPS coordinate reach a log line (AGENTS.md §3.5).
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["x-cld-signature"]',
          '*.api_secret',
          '*.service_role',
          '*.token',
        ],
        remove: true,
      },
    },
    genReqId: () => crypto.randomUUID(),
  });

  app.decorate('deps', deps);
  app.decorateRequest('auth', null);

  // request_id echoed on every response.
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    return payload;
  });

  app.decorate('authenticate', (request: FastifyRequest): AuthContext => {
    const token = extractBearer(request.headers.authorization);
    const identity = verifySupabaseJwt(token, deps.config.SUPABASE_JWT_SECRET);
    const ctx: AuthContext = { ...identity, jwt: token };
    request.auth = ctx;
    return ctx;
  });

  app.decorate('requireRole', (request: FastifyRequest, ...roles: Role[]): AuthContext => {
    const ctx = app.authenticate(request);
    if (!roles.includes(ctx.role)) {
      throw errors.forbidden('insufficient role', { required: roles, actual: ctx.role });
    }
    return ctx;
  });

  if (deps.rateLimitEnabled !== false) {
    await app.register(rateLimit, {
      global: false,
      // Per-user sliding window; fall back to IP for unauthenticated routes.
      keyGenerator: (request) => request.auth?.userId ?? request.ip,
    });
  }

  // Typed error handler → uniform envelope, no stack/secret leakage.
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof HttpError) {
      request.log.warn({ code: error.code, msg: error.message }, 'request rejected');
      void reply.status(error.statusCode).send(fail(error.code, error.message, error.details));
      return;
    }
    if (error instanceof ZodError) {
      void reply
        .status(400)
        .send(fail('VALIDATION_ERROR', 'Validation failed', { issues: error.issues }));
      return;
    }
    // Fastify validation / rate-limit errors carry a statusCode.
    const status = typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status === 429) {
      void reply.status(429).send(fail('RATE_LIMITED', 'Too many requests'));
      return;
    }
    if (status >= 400 && status < 500) {
      void reply.status(status).send(fail('VALIDATION_ERROR', error.message));
      return;
    }
    request.log.error({ err: error }, 'unhandled error');
    void reply.status(500).send(fail('INTERNAL_ERROR', 'Internal error'));
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.status(404).send(fail('NOT_FOUND', 'Route not found'));
  });

  await registerHealthRoutes(app);
  await registerProjectRoutes(app);
  await registerAssetRoutes(app);
  await registerOrgRoutes(app);
  await registerIntegrityRoutes(app);
  await registerCloudinaryWebhook(app);

  return app;
}
