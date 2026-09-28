/**
 * Native adapter: capture signer (BUILD_ORDER Phase 4 "Signing", AGENTS.md §8).
 *
 * This is the **software fallback** signer and it reports `signatureTier:
 * 'server'` — never `'device'`. A hardware-backed Ed25519 key wrapped by the
 * platform Keystore / Secure Enclave is a separate signer that would report
 * `'device'`; until that hardware path is confirmed on-device (a §8 decision),
 * {@link resolveKeystoreSigner} returns `null` and the pipeline honestly falls
 * back here. Relabelling this signer `'device'` is a gate `FAIL` (§8).
 *
 * The Ed25519 seed lives in `expo-secure-store` (Keychain / Keystore-encrypted
 * at rest) but the signing itself is pure-JS `@noble/ed25519`, so the key is not
 * hardware-non-extractable — hence the honest `'server'` tier.
 */
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import * as SecureStore from 'expo-secure-store';

import type { CaptureSigner } from '../ports.js';

// @noble/ed25519 v2 needs a SHA-512 to be wired in explicitly.
ed.etc.sha512Sync = (...m: Uint8Array[]): Uint8Array => sha512(ed.etc.concatBytes(...m));

const SEED_KEY = 'impact.capture.ed25519.seed.v1';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Software Ed25519 signer whose seed is persisted in the platform secure store.
 * Reports `'server'` tier — the honest label for a non-hardware key (§8).
 */
export class SecureStoreSigner implements CaptureSigner {
  readonly signatureTier = 'server' as const;
  private seed: Uint8Array | null = null;

  private async loadSeed(): Promise<Uint8Array> {
    if (this.seed) return this.seed;
    const stored = await SecureStore.getItemAsync(SEED_KEY);
    if (stored !== null) {
      this.seed = base64ToBytes(stored);
      return this.seed;
    }
    const seed = ed.utils.randomPrivateKey();
    await SecureStore.setItemAsync(SEED_KEY, bytesToBase64(seed), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    this.seed = seed;
    return seed;
  }

  async publicKeyBase64(): Promise<string> {
    const seed = await this.loadSeed();
    return bytesToBase64(ed.getPublicKey(seed));
  }

  async sign(message: Uint8Array): Promise<string> {
    const seed = await this.loadSeed();
    return bytesToBase64(ed.sign(message, seed));
  }
}

/**
 * Resolve a hardware-backed (`'device'`-tier) signer, or `null` when the Keystore
 * / Secure-Enclave Ed25519 path is unavailable on this device. Returns `null`
 * today: hardware feasibility is an open §8 decision, and inventing a `'device'`
 * tier without a hardware key is forbidden. When implemented, this must return a
 * signer whose `signatureTier === 'device'` or `resolveSigner` will reject it.
 */
export function resolveKeystoreSigner(): CaptureSigner | null {
  return null;
}
