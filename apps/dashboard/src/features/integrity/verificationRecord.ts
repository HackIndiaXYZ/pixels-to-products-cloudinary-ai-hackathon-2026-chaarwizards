import type { AssetIntegrity } from '../assets/api';
import type { ChainVerification, ReportVerificationReceipt } from './api';

/**
 * The exportable verification record (BUILD_ORDER Phase 10 — "exportable
 * verification record"). It is deliberately deterministic: the same inputs
 * always serialize to the same bytes, so an exported file re-verifies to the
 * SAME result on a second run against Postgres — evidence, not decoration.
 *
 * It carries only what a reviewer needs to re-check independently: the chain
 * verdict + tip hash, the per-check integrity verdicts (tri-state, where
 * `unknown` is NEVER laundered into `pass`, §3.7), and the device/server
 * timestamps for the skew comparison. No org_id, user, GPS, or caption.
 */
export interface VerificationRecordChain {
  readonly asset_id: string;
  readonly ok: boolean;
  readonly checked: number;
  readonly tip_hash: string | null;
  readonly failure: ChainVerification['failure'];
}

export interface VerificationRecordCheck {
  readonly name: string;
  readonly verdict: 'pass' | 'fail' | 'unknown';
}

export interface VerificationRecordTimestamps {
  readonly device_capture_timestamp: string;
  readonly server_upload_timestamp: string | null;
  readonly server_received_at: string | null;
  readonly clock_drift_seconds: number | null;
}

export interface VerificationRecord {
  readonly kind: 'asset_chain_verification';
  readonly asset_id: string;
  readonly chain: VerificationRecordChain;
  readonly checks: readonly VerificationRecordCheck[];
  readonly timestamps: VerificationRecordTimestamps;
}

/** tri-state: only a genuine `true` passes; null/undefined → unknown (§3.7). */
function verdict(value: boolean | null | undefined): 'pass' | 'fail' | 'unknown' {
  if (value === true) return 'pass';
  if (value === false) return 'fail';
  return 'unknown';
}

/** Build the record from the chain verdict and the flat integrity contract. */
export function buildVerificationRecord(
  chain: ChainVerification,
  integrity: AssetIntegrity,
): VerificationRecord {
  return {
    kind: 'asset_chain_verification',
    asset_id: chain.asset_id,
    chain: {
      asset_id: chain.asset_id,
      ok: chain.ok,
      checked: chain.checked,
      tip_hash: chain.tip_hash,
      failure: chain.failure,
    },
    checks: [
      { name: 'device_signature', verdict: verdict(integrity.device_signature_verified) },
      { name: 'exif_hash', verdict: verdict(integrity.exif_hash_verified) },
      { name: 'caption_signature', verdict: verdict(integrity.caption_signature_verified) },
      { name: 'audit_chain_intact', verdict: verdict(integrity.audit_chain_intact) },
      { name: 'sha256_matches_commit', verdict: verdict(integrity.sha256_matches_commit) },
    ],
    timestamps: {
      device_capture_timestamp: integrity.device_capture_timestamp,
      server_upload_timestamp: integrity.server_upload_timestamp,
      server_received_at: integrity.server_received_at,
      clock_drift_seconds: integrity.clock_drift_seconds,
    },
  };
}

/** Recursively sort object keys so serialization is order-independent. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Stable serialization for export. Keys are emitted in a fixed (sorted) order at
 * every level so the file is byte-identical across runs regardless of property
 * order; a diff of two exports is therefore meaningful.
 */
export function serializeVerificationRecord(
  record: VerificationRecord | ReportVerificationReceipt,
): string {
  return `${JSON.stringify(sortKeys(record), null, 2)}\n`;
}

/**
 * Re-verify an exported record against a freshly-fetched one. Returns true when
 * they agree, which is the property the gate asserts: an export is evidence only
 * if a second run reproduces the same result.
 */
export function reVerify(
  exported: VerificationRecord,
  fresh: VerificationRecord,
): boolean {
  return JSON.stringify(exported) === JSON.stringify(fresh);
}
