import { apiRequest } from '../../shared/api/client';

/**
 * Phase 10 audit & integrity surfacing API.
 *
 *   getChainVerification — `GET /v1/assets/:id/verify-chain`. Walks the asset's
 *     audit chain server-side (Postgres recomputes every hash, §3.8) and returns
 *     a structured verdict that NAMES the first tampered row or gap.
 *   getReportVerification — `GET /v1/reports/:id/verification`. A public-safe
 *     receipt: only hashes, timestamps, and per-asset chain verdicts. It carries
 *     no org_id, user identity, GPS, caption, or public_id, so it is safe to
 *     export and share as standalone evidence.
 */

export interface ChainFailure {
  readonly audit_id: number;
  readonly kind: 'broken_link' | 'hash_mismatch' | 'details_tampered';
  readonly reason: string;
}

export interface ChainVerification {
  readonly asset_id: string;
  readonly ok: boolean;
  readonly checked: number;
  readonly first_id: number | null;
  readonly last_id: number | null;
  readonly tip_hash: string | null;
  readonly failure: ChainFailure | null;
}

export interface ReceiptAssetChain {
  readonly index: number;
  readonly chain_verified: boolean;
  readonly chain_length: number;
  readonly tip_hash: string | null;
  readonly failure: ChainFailure | null;
}

export interface ReceiptManifestEntry {
  readonly ordinal: number;
  readonly role: string;
  readonly sha256_hash: string | null;
  readonly byte_size: number | null;
  readonly verified: boolean;
}

export interface ReportVerificationReceipt {
  readonly report_id: string;
  readonly status: string;
  readonly template_version: string | null;
  readonly generated_at: string;
  readonly byte_size: number | null;
  readonly chains_verified: boolean;
  readonly asset_chains: readonly ReceiptAssetChain[];
  readonly manifest: readonly ReceiptManifestEntry[];
}

export async function getChainVerification(assetId: string): Promise<ChainVerification> {
  return apiRequest<ChainVerification>(`/v1/assets/${assetId}/verify-chain`);
}

export async function getReportVerification(reportId: string): Promise<ReportVerificationReceipt> {
  return apiRequest<ReportVerificationReceipt>(`/v1/reports/${reportId}/verification`);
}
