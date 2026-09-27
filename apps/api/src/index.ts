/**
 * @impact/api — Fastify backend (Node 20 · TypeScript · BullMQ).
 *
 * Phase 3 ships the secured core API: auth, request-scoped Supabase clients,
 * project CRUD, the Cloudinary webhook ingest + independent verification,
 * delivery-URL signing with a transformation allowlist, the internal ML client,
 * org provisioning, pagination, and rate limits. Everything is wired through
 * injectable ports (see `app.ts`) so it is testable without live infrastructure.
 */
import { v2 as cloudinary } from 'cloudinary';
import { SHARED_PACKAGE_VERSION } from '@impact/shared';

// Prove the v2 handle resolves. No secrets, no hand-rolled signing (AGENTS.md §3.11).
export const cloudinarySdk = cloudinary;

export const API_PACKAGE_VERSION = '0.0.0' as const;

export function apiBanner(): string {
  return `@impact/api ${API_PACKAGE_VERSION} (shared ${SHARED_PACKAGE_VERSION})`;
}

export { buildApp, type AppDeps } from './app.js';
export { loadConfig, type Config } from './config.js';
export type * from './ports.js';
export { HttpError, errors, type AuthContext } from './types.js';
