/**
 * @impact/capture-app — Expo · React Native capture client.
 *
 * Phase 0 ships only the package skeleton so later phases have a place
 * to land. The full Expo Router app (expo-camera, expo-location, MMKV
 * queue, Ed25519 signing) is Phase 4 work and is intentionally NOT
 * scaffolded here — see BUILD_ORDER.md Phase 4.
 */
import { SHARED_PACKAGE_VERSION } from '@impact/shared';

export const CAPTURE_APP_VERSION = '0.0.0' as const;

export function captureAppBanner(): string {
  return `@impact/capture-app ${CAPTURE_APP_VERSION} (shared ${SHARED_PACKAGE_VERSION})`;
}
