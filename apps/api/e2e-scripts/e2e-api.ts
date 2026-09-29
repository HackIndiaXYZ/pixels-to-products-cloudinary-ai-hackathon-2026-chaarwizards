/**
 * Phase 8 E2E launcher (NOT production). Boots the real Fastify app against the
 * LOCAL Supabase stack with the real request-scoped Supabase adapter, so RLS,
 * the custom access-token hook, and the new /v1/search + read endpoints are
 * exercised end to end. Queue / Cloudinary / ML are stubbed because the two gate
 * flows (search→asset→integrity, quarantine admin queue) never touch them.
 */
import { buildApp } from '../src/app.js';
import { createSupabaseDb } from '../src/plugins/supabase.js';
import type { CloudinaryPort, QueuePort } from '../src/ports.js';
import type { Config } from '../src/config.js';

const config: Config = {
  NODE_ENV: 'development',
  HOST: '127.0.0.1',
  PORT: 8080,
  LOG_LEVEL: 'warn',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: process.env['E2E_ANON_KEY'] as string,
  SUPABASE_SERVICE_KEY: process.env['E2E_SERVICE_KEY'] as string,
  SUPABASE_JWT_SECRET: 'super-secret-jwt-token-with-at-least-32-characters-long',
  CLOUDINARY_CLOUD_NAME: 'demo',
  CLOUDINARY_API_KEY: 'key',
  CLOUDINARY_API_SECRET: 'secret',
  CLOUDINARY_UPLOAD_PRESET: 'verified_capture',
  INTERNAL_JWT_SECRET: 'internal-secret-internal-secret-internal',
  REDIS_URL: 'redis://localhost:6379',
  ML_SERVICE_URL: 'http://localhost:9000',
  DASHBOARD_URL: 'http://127.0.0.1:5173',
};

const queue: QueuePort = {
  async enqueueAiEnrich() {},
  async enqueuePairAssets() {},
  async enqueueDetectChange() {},
  async ping() {},
  async close() {},
};

const cloudinary: CloudinaryPort = {
  verifyNotificationSignature: () => false,
  signedDerivativeUrl: (publicId, t) => `https://res.cloudinary.com/demo/image/upload/${t}/v1/${publicId}`,
  originalUrl: (publicId, ttl) => ({
    url: `https://res.cloudinary.com/demo/image/authenticated/${publicId}`,
    expiresAt: Math.floor(Date.now() / 1000) + ttl,
  }),
  async createEagerDerivative() {
    throw new Error('not used in E2E');
  },
  signRequest: () => 'stub',
};

const app = await buildApp({
  config,
  db: createSupabaseDb(config),
  cloudinary,
  queue,
  ml: { async detectChange() { throw new Error('not used in E2E'); } },
  renderer: { async htmlToPdf() { throw new Error('reports not used in E2E'); } },
  rateLimitEnabled: false,
});

await app.listen({ host: config.HOST, port: config.PORT });
// eslint-disable-next-line no-console
console.log('E2E API listening on http://127.0.0.1:8080');
