import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { sha256Canonical, buildSigningPayload, type SigningPayloadInput } from '@impact/shared';
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import { verifyExifHash, verifyCaptureSignature, overallVerification } from './verification.js';

const basePayload = (): SigningPayloadInput => ({
  v: 1,
  sha256: 'a'.repeat(64),
  exif_hash: 'b'.repeat(64),
  captured_at_ms: 1_700_000_000_000,
  device_monotonic_ms: 12345,
  gps: { lat_e7: 191234000, lon_e7: 728765000, accuracy_m: 3.2 },
  project_id: '00000000-0000-4000-8000-000000000001',
  observation_type: 'planting',
  phase: 'before',
  caption: null,
});

describe('verifyExifHash', () => {
  it('passes when the JCS hash matches', () => {
    const exif = { Make: 'Apple', Model: 'iPhone 15 Pro', Orientation: 1 };
    expect(verifyExifHash(exif, sha256Canonical(exif))).toBe('pass');
  });

  it('fails when the EXIF was tampered after signing', () => {
    const exif = { Make: 'Apple', Orientation: 1 };
    const signedHash = sha256Canonical(exif);
    const tampered = { ...exif, Software: 'Photoshop' };
    expect(verifyExifHash(tampered, signedHash)).toBe('fail');
  });

  it('is unknown when inputs are missing', () => {
    expect(verifyExifHash(null, 'x')).toBe('unknown');
    expect(verifyExifHash({ a: 1 }, null)).toBe('unknown');
  });
});

describe('verifyCaptureSignature', () => {
  it('passes over a raw-key signature', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const raw = der.subarray(der.length - 32).toString('base64');
    const payload = basePayload();
    const sig = edSign(null, Buffer.from(buildSigningPayload(payload), 'utf8'), privateKey).toString(
      'base64',
    );
    expect(verifyCaptureSignature(payload, sig, raw)).toBe('pass');
  });

  it('fails a signature over a mutated payload', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    const raw = der.subarray(der.length - 32).toString('base64');
    const payload = basePayload();
    const sig = edSign(null, Buffer.from(buildSigningPayload(payload), 'utf8'), privateKey).toString(
      'base64',
    );
    const mutated = { ...payload, caption: 'edited after signing' };
    expect(verifyCaptureSignature(mutated, sig, raw)).toBe('fail');
  });
});

describe('overallVerification', () => {
  it('fails if any check fails', () => {
    expect(overallVerification(['pass', 'fail', 'pass'])).toBe('failed');
  });
  it('is unknown if a check is unknown and none fail', () => {
    expect(overallVerification(['pass', 'unknown'])).toBe('unknown');
  });
  it('passes only when all pass', () => {
    expect(overallVerification(['pass', 'pass'])).toBe('passed');
  });
});

describe('ml client contract (jwt is minted, never a bare secret)', () => {
  it('every call carries a fresh 120s internal JWT', async () => {
    const { mintInternalJwt, INTERNAL_JWT_TTL_SECONDS } = await import('./ml-client.js');
    const token = mintInternalJwt('secret', { sub: 'u1', org_id: 'o1', job_id: 'j1' });
    const decoded = jwt.verify(token, 'secret') as jwt.JwtPayload;
    expect(decoded.sub).toBe('u1');
    expect(decoded.org_id).toBe('o1');
    expect(decoded.job_id).toBe('j1');
    const ttl = (decoded.exp ?? 0) - (decoded.iat ?? 0);
    expect(ttl).toBe(INTERNAL_JWT_TTL_SECONDS);
  });
});
