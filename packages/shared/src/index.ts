/**
 * @panchnama/shared — single source of truth for cross-service types,
 * Zod schemas, RFC 8785 canonicalization, and the signing payload.
 *
 * Import domain types and schemas from here; never re-declare them in a service
 * (AGENTS.md §4). The canonicalizer and signing payload are the byte-exact
 * contract the capture app, the API, and the ML service all agree on.
 */

export const SHARED_PACKAGE_VERSION = '0.0.0' as const;

export * from './canonicalize.js';
export * from './hash.js';
export * from './enums.js';
export * from './envelope.js';
export * from './schemas.js';
export * from './signing.js';
