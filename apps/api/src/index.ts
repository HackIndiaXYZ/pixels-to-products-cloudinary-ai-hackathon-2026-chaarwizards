/**
 * @impact/api — Fastify backend (Node 20 · TypeScript · BullMQ).
 *
 * Phase 0 ships only the package skeleton and confirms the server-side
 * Cloudinary SDK is wired as v2 (AGENTS.md §4: never v1). The Fastify
 * app, plugins, routes, and workers land in Phase 3.
 */
import { v2 as cloudinary } from 'cloudinary';
import { SHARED_PACKAGE_VERSION } from '@impact/shared';

// Prove the v2 handle resolves. No secrets, no hand-rolled signing (AGENTS.md §3.11).
export const cloudinarySdk = cloudinary;

export const API_PACKAGE_VERSION = '0.0.0' as const;

export function apiBanner(): string {
  return `@impact/api ${API_PACKAGE_VERSION} (shared ${SHARED_PACKAGE_VERSION})`;
}
