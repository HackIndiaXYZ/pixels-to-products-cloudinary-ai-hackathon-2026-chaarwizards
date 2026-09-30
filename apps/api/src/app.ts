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
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { fail, type Role } from '@impact/shared';
import type { Config } from './config.js';
import type { CloudinaryPort, DbPort, QueuePort } from './ports.js';
import type { MlClient } from './services/ml-client.js';
import { HttpError, errors, type AuthContext } from './types.js';
import { extractBearer, verifySupabaseJwtAsync, JwksCache } from './plugins/auth.js';
import { createInMemoryOrgRateLimiter, type OrgRateLimiter } from './lib/org-rate-limit.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerOrgRoutes } from './routes/orgs.js';
import { registerIntegrityRoutes } from './routes/integrity.js';
import { registerPairRoutes } from './routes/pairs.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerReadRoutes } from './routes/reads.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerVerificationRoutes } from './routes/verification.js';
import { registerCloudinaryWebhook } from './routes/webhooks/cloudinary.js';
import type { ReportRenderer } from './reports/renderer.js';

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
  /**
   * HTML → PDF renderer for report generation (Phase 9). Injected so a fake
   * renderer drives the gate without Chromium; production wires Puppeteer.
   */
  renderer: ReportRenderer;
  /** `@font-face` CSS with inlined Inter bytes for reports; '' if none embedded. */
  reportFontCss?: string;
  /** Disable the rate limiter (tests). Defaults to enabled. */
  rateLimitEnabled?: boolean;
  /**
   * Per-org upload limiter for the webhook ingest path (Phase 11). Injected so a
   * test can drive a tiny limit; production builds one from config in
   * {@link buildApp}. Keyed on the org derived from the signed project_id.
   */
  orgUploadLimiter?: OrgRateLimiter;
  /**
   * Destination for the Pino logger, injected so the Phase 11 gate can capture
   * emitted output and assert it carries no secret or PII (AGENTS.md §3.5). In
   * production the logger writes to stdout (Pino's default) when this is unset.
   */
  logStream?: NodeJS.WritableStream;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
    /** Verification error captured by the auth preHandler, re-thrown by `authenticate`. */
    authError: unknown;
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
      // Never let a secret, a bearer token, or a GPS coordinate reach a log line
      // (AGENTS.md §3.5). This covers the Cloudinary/Supabase secrets, the raw
      // Supabase JWT (carried on `request.auth.jwt`), and the local HS256
      // verification secret, wherever they might be nested in a logged object.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["x-cld-signature"]',
          '*.api_secret',
          '*.service_role',
          '*.token',
          '*.jwt',
          'req.auth.jwt',
          '*.SUPABASE_JWT_SECRET',
          '*.jwt_secret',
          // GPS is PII: never log a device's coordinates (AGENTS.md §3.5 / §3.7).
          '*.gps_lat',
          '*.gps_lon',
          '*.gps',
        ],
        remove: true,
      },
      ...(deps.logStream !== undefined ? { stream: deps.logStream } : {}),
    },
    genReqId: () => crypto.randomUUID(),
  });

  app.decorate('deps', deps);
  app.decorateRequest('auth', null);
  app.decorateRequest('authError', null);

  // Per-org upload limiter (Phase 11). Built from config unless a test injected
  // one. Lives for the app's lifetime so its windows persist across requests.
  deps.orgUploadLimiter ??= createInMemoryOrgRateLimiter({
    max: deps.config.ORG_UPLOAD_RATE_MAX,
    windowMs: deps.config.ORG_UPLOAD_RATE_WINDOW_MS,
  });

  // JWKS cache for asymmetric (ES256/RS256) Supabase tokens. HS256 tokens do not
  // touch it (they verify with the shared secret).
  const jwks = new JwksCache(
    `${deps.config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`,
  );

  // CORS: the dashboard is a browser SPA on a different origin, so it cannot call
  // the API without CORS headers. Lock the allowed origin to the configured
  // dashboard URL in production; in dev also accept any localhost/127.0.0.1 port
  // (Vite). Auth is a Bearer header, not a cookie, so credentials stay off.
  await app.register(cors, {
    origin: (origin, cb) => {
      if (origin === undefined) return cb(null, true); // non-browser / same-origin
      const allowed =
        origin === deps.config.DASHBOARD_URL ||
        (deps.config.NODE_ENV !== 'production' &&
          /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));
      cb(null, allowed);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
  });

  // request_id echoed on every response.
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    return payload;
  });

  // Verify the bearer token once, before handlers, so verification can be async
  // (a JWKS fetch on a cache miss) while `authenticate`/`requireRole` stay
  // synchronous readers. A route with no Authorization header is left
  // unauthenticated; whether that is an error is the route's call (health and
  // the Cloudinary webhook never call `authenticate`). A present-but-invalid
  // token is captured and re-thrown when a handler asks for the identity.
  app.addHook('preHandler', async (request) => {
    const header = request.headers.authorization;
    if (header === undefined) return;
    try {
      const token = extractBearer(header);
      const identity = await verifySupabaseJwtAsync(token, {
        secret: deps.config.SUPABASE_JWT_SECRET,
        jwks,
      });
      request.auth = { ...identity, jwt: token };
    } catch (err) {
      request.authError = err;
    }
  });

  app.decorate('authenticate', (request: FastifyRequest): AuthContext => {
    if (request.authError !== null && request.authError !== undefined) {
      throw request.authError;
    }
    if (request.auth === null) {
      throw errors.unauthorized('missing Authorization header');
    }
    return request.auth;
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
  await registerPairRoutes(app);
  await registerSearchRoutes(app);
  await registerReadRoutes(app);
  await registerReportRoutes(app);
  await registerVerificationRoutes(app);
  await registerCloudinaryWebhook(app);

  return app;
}
