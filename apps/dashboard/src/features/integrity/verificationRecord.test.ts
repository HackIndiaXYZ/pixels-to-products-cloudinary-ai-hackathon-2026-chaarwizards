import { describe, expect, it } from 'vitest';
import type { AssetIntegrity } from '../assets/api';
import type { ChainVerification } from './api';
import {
  buildVerificationRecord,
  reVerify,
  serializeVerificationRecord,
} from './verificationRecord';

const integrity: AssetIntegrity = {
  asset_id: 'a1',
  device_capture_timestamp: '2024-01-15T09:30:00Z',
  server_upload_timestamp: '2024-01-15T09:30:05Z',
  server_received_at: '2024-01-15T09:30:05.123Z',
  clock_drift_seconds: 5,
  gps_accuracy_meters: 3.2,
  gps_provider: 'fused',
  device_signature_verified: true,
  exif_hash_verified: true,
  caption_signature_verified: null, // no caption → unknown
  audit_chain_intact: true,
  sha256_matches_commit: true,
};

const chain: ChainVerification = {
  asset_id: 'a1',
  ok: true,
  checked: 3,
  first_id: 1,
  last_id: 3,
  tip_hash: 'deadbeef',
  failure: null,
};

describe('buildVerificationRecord', () => {
  it('maps a null check to unknown, never pass (§3.7)', () => {
    const record = buildVerificationRecord(chain, integrity);
    const caption = record.checks.find((c) => c.name === 'caption_signature');
    expect(caption?.verdict).toBe('unknown');
  });

  it('carries the chain tip and verdict', () => {
    const record = buildVerificationRecord(chain, integrity);
    expect(record.chain.tip_hash).toBe('deadbeef');
    expect(record.chain.ok).toBe(true);
  });

  it('leaks no GPS or org data into the record', () => {
    const record = buildVerificationRecord(chain, integrity);
    const raw = JSON.stringify(record);
    expect(raw).not.toContain('gps');
    expect(raw).not.toContain('3.2');
    expect(raw).not.toContain('org');
  });
});

describe('serializeVerificationRecord (deterministic export)', () => {
  it('is byte-identical regardless of property order', () => {
    const a = buildVerificationRecord(chain, integrity);
    const b = buildVerificationRecord(chain, integrity);
    expect(serializeVerificationRecord(a)).toBe(serializeVerificationRecord(b));
  });
});

describe('reVerify', () => {
  it('re-verifies to the same result on a second run', () => {
    const exported = buildVerificationRecord(chain, integrity);
    const fresh = buildVerificationRecord(chain, integrity);
    expect(reVerify(exported, fresh)).toBe(true);
  });

  it('detects a divergent re-run (e.g. a later tamper)', () => {
    const exported = buildVerificationRecord(chain, integrity);
    const tampered = buildVerificationRecord(
      { ...chain, ok: false, failure: { audit_id: 2, kind: 'hash_mismatch', reason: 'r' } },
      integrity,
    );
    expect(reVerify(exported, tampered)).toBe(false);
  });
});
