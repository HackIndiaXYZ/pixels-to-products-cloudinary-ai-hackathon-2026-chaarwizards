import { describe, expect, it } from 'vitest';
import type { SigningPayloadInput } from '@impact/shared/rn';
import { resolveSigner, signCapture, verifyLocalCapture } from './signing.js';
import { NodeEd25519Signer } from './testing/fakes.js';

const PAYLOAD: SigningPayloadInput = {
  v: 1,
  sha256: 'a'.repeat(64),
  exif_hash: 'b'.repeat(64),
  captured_at_ms: 1_700_000_000_000,
  device_monotonic_ms: 12_345,
  gps: { lat_e7: 191234000, lon_e7: 728765000, accuracy_m: 3.2, provider: 'fused' },
  project_id: '11111111-1111-4111-8111-111111111111',
  observation_type: 'planting',
  phase: 'before',
  caption: 'Planted 50 saplings',
};

describe('signCapture / verifyLocalCapture', () => {
  it('produces a signature that verifies over the same payload', async () => {
    const signer = new NodeEd25519Signer('device');
    const signed = await signCapture(PAYLOAD, signer);
    expect(verifyLocalCapture(PAYLOAD, signed)).toBe(true);
  });

  it('fails verification when the payload is altered after signing', async () => {
    const signer = new NodeEd25519Signer('device');
    const signed = await signCapture(PAYLOAD, signer);
    const tampered: SigningPayloadInput = { ...PAYLOAD, caption: 'edited after signing' };
    expect(verifyLocalCapture(tampered, signed)).toBe(false);
  });

  it('carries the signer signature_tier verbatim', async () => {
    const device = await signCapture(PAYLOAD, new NodeEd25519Signer('device'));
    const server = await signCapture(PAYLOAD, new NodeEd25519Signer('server'));
    expect(device.signatureTier).toBe('device');
    expect(server.signatureTier).toBe('server');
  });
});

describe('resolveSigner (AGENTS.md §8 honesty)', () => {
  it('prefers the hardware keystore signer, reporting device', () => {
    const keystore = new NodeEd25519Signer('device');
    const fallback = new NodeEd25519Signer('server');
    expect(resolveSigner(keystore, fallback).signatureTier).toBe('device');
  });

  it('falls back to server — never device — when the keystore is unavailable', () => {
    const fallback = new NodeEd25519Signer('server');
    const resolved = resolveSigner(null, fallback);
    expect(resolved.signatureTier).toBe('server');
    // A test asserting 'device' on the fallback would be a FAIL, per §8.
    expect(resolved.signatureTier).not.toBe('device');
  });

  it('refuses a keystore signer that does not honestly report device', () => {
    const mislabelled = new NodeEd25519Signer('server');
    expect(() => resolveSigner(mislabelled, new NodeEd25519Signer('server'))).toThrow();
  });

  it('refuses a fallback signer that claims device', () => {
    const dishonestFallback = new NodeEd25519Signer('device');
    expect(() => resolveSigner(null, dishonestFallback)).toThrow();
  });
});
