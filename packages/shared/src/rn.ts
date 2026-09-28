/**
 * @impact/shared/rn — the **pure**, React-Native-safe surface of the shared
 * package. Identical to the main barrel except it omits the Ed25519 sign/verify
 * primitives in `signing.ts`, which import `node:crypto` and cannot bundle under
 * React Native. The capture app imports from here; the API and other Node
 * services import the full barrel (`@impact/shared`).
 *
 * Everything exported here is dependency-free of `node:crypto` and `Buffer`:
 * canonicalization, the pure-JS SHA-256, enums, the response envelope, the Zod
 * schemas, and the signing **payload** builder (`buildSigningPayload`). Ed25519
 * verification on-device is done by the capture app with `@noble/ed25519`.
 */
export const SHARED_PACKAGE_VERSION = '0.0.0' as const;

export * from './canonicalize.js';
export * from './hash.js';
export * from './enums.js';
export * from './envelope.js';
export * from './schemas.js';
export * from './signing-payload.js';
