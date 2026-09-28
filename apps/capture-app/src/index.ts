/**
 * @impact/capture-app — Expo · React Native capture client.
 *
 * Phase 4 implements the platform-agnostic capture pipeline behind injectable
 * ports (see `ports.ts`): project picker, GPS gating, EXIF freeze, streamed
 * SHA-256, Ed25519 signing with honest `signature_tier`, the MMKV-backed offline
 * queue, the sync engine, and video-capture rules. The native wiring of each
 * port to its Expo/React-Native module and the UI screens are exercised by the
 * device tests deferred to user review (BUILD_ORDER Phase 4).
 */
import { SHARED_PACKAGE_VERSION } from '@impact/shared/rn';

export const CAPTURE_APP_VERSION = '0.0.0' as const;

export function captureAppBanner(): string {
  return `@impact/capture-app ${CAPTURE_APP_VERSION} (shared ${SHARED_PACKAGE_VERSION})`;
}

export * from './ports.js';
export * from './exif.js';
export * from './hashing.js';
export * from './signing.js';
export * from './gps.js';
export * from './projects.js';
export * from './queue.js';
export * from './sync.js';
export * from './video.js';
export * from './capture.js';
