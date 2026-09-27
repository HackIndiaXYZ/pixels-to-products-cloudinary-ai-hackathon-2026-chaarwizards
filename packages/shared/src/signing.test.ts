import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  buildSigningPayload,
  GPS_COORD_SCALE,
  signPayload,
  SigningPayloadInputSchema,
  verifyPayload,
  type SigningPayloadInput,
} from './signing.js';

const baseInput: SigningPayloadInput = {
  sha256: 'a'.repeat(64),
  exif_hash: 'b'.repeat(64),
  captured_at_ms: 1775899927412,
  device_monotonic_ms: 84523,
  gps: { lat_e7: 129716000, lon_e7: 775946000, accuracy_m: 4.2, altitude_m: 920.1, provider: 'fused' },
  project_id: '550e8400-e29b-41d4-a716-446655440000',
  observation_type: 'forestry',
  phase: 'before',
  caption: null,
};

describe('buildSigningPayload', () => {
  it('produces canonical, key-sorted bytes', () => {
    const payload = buildSigningPayload(baseInput);
    expect(payload).toBe(
      '{"caption":null,"captured_at_ms":1775899927412,"device_monotonic_ms":84523,' +
        '"exif_hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",' +
        '"gps":{"accuracy_m":4.2,"altitude_m":920.1,"lat_e7":129716000,"lon_e7":775946000,"provider":"fused"},' +
        '"observation_type":"forestry","phase":"before",' +
        '"project_id":"550e8400-e29b-41d4-a716-446655440000",' +
        '"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","v":1}',
    );
  });

  it('re-derives byte-identical bytes from round-tripped column values', () => {
    // Simulate the API path: the client's typed values are persisted, then
    // re-read from the columns and re-encoded. This must reproduce the exact
    // bytes the device signed (AGENTS.md §3.4, §3.8), or genuine captures fail
    // verification.
    const signed = buildSigningPayload(baseInput);

    // captured_at_ms → device_capture_timestamp TIMESTAMPTZ → back to epoch ms.
    const storedTs = new Date(baseInput.captured_at_ms as number);
    const reCapturedMs = Math.round(storedTs.getTime());

    // lat_e7 → gps_point GEOGRAPHY double degrees → round(deg * 1e7).
    const storedLatDeg = baseInput.gps.lat_e7 / GPS_COORD_SCALE;
    const storedLonDeg = baseInput.gps.lon_e7 / GPS_COORD_SCALE;
    const reLatE7 = Math.round(storedLatDeg * GPS_COORD_SCALE);
    const reLonE7 = Math.round(storedLonDeg * GPS_COORD_SCALE);

    const reDerived = buildSigningPayload({
      ...baseInput,
      captured_at_ms: reCapturedMs,
      gps: { ...baseInput.gps, lat_e7: reLatE7, lon_e7: reLonE7 },
    });

    expect(reDerived).toBe(signed);
  });

  it('defaults v to 1 and caption to null', () => {
    const { v: _v, caption: _caption, ...rest } = baseInput;
    const payload = buildSigningPayload(rest as SigningPayloadInput);
    expect(payload).toContain('"v":1');
    expect(payload).toContain('"caption":null');
  });

  it('rejects a malformed payload (non-hex hash) rather than signing it', () => {
    const bad = { ...baseInput, sha256: 'NOT-HEX' };
    expect(() => buildSigningPayload(bad)).toThrow(z.ZodError);
  });

  it('rejects a malformed payload (bad uuid)', () => {
    const bad = { ...baseInput, project_id: 'not-a-uuid' };
    expect(() => buildSigningPayload(bad)).toThrow(z.ZodError);
  });

  it('rejects a phase outside the assets.phase domain', () => {
    const bad = { ...baseInput, phase: 'baseline' } as unknown as SigningPayloadInput;
    expect(() => buildSigningPayload(bad)).toThrow(z.ZodError);
  });

  it('rejects non-integer GPS coordinates', () => {
    const bad = {
      ...baseInput,
      gps: { ...baseInput.gps, lat_e7: 12.9716 },
    } as unknown as SigningPayloadInput;
    expect(() => buildSigningPayload(bad)).toThrow(z.ZodError);
  });
});

describe('SigningPayloadInputSchema failure paths', () => {
  it('throws on a missing required field', () => {
    const { sha256: _omitted, ...rest } = baseInput;
    expect(() => SigningPayloadInputSchema.parse(rest)).toThrow(z.ZodError);
  });

  it('throws on a wrong-typed field', () => {
    expect(() =>
      SigningPayloadInputSchema.parse({ ...baseInput, gps: { lat: 'x', lon: 1 } }),
    ).toThrow(z.ZodError);
  });

  it('strips an unknown key rather than smuggling it downstream', () => {
    const parsed = SigningPayloadInputSchema.parse({
      ...baseInput,
      injected: 'should-be-removed',
    });
    expect(parsed).not.toHaveProperty('injected');
  });
});

describe('signPayload / verifyPayload — Ed25519', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');

  it('verifies a genuine signature', () => {
    const signature = signPayload(baseInput, privateKey);
    expect(verifyPayload(baseInput, signature, publicKey)).toBe(true);
  });

  it('rejects a payload tampered after signing', () => {
    const signature = signPayload(baseInput, privateKey);
    const tampered: SigningPayloadInput = { ...baseInput, caption: 'edited after signing' };
    expect(verifyPayload(tampered, signature, publicKey)).toBe(false);
  });

  it('rejects a signature made with the wrong key', () => {
    const signature = signPayload(baseInput, privateKey);
    const other = generateKeyPairSync('ed25519');
    expect(verifyPayload(baseInput, signature, other.publicKey)).toBe(false);
  });

  it('returns false (never throws) on a garbage signature', () => {
    expect(verifyPayload(baseInput, 'not-base64-sig', publicKey)).toBe(false);
  });
});
