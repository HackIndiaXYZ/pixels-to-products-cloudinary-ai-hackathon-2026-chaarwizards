/**
 * Storage-quota enforcement (AGENTS.md: never delete media to stay under cap;
 * api-contracts.md 507 semantics). An org at or above 100% of `quota_bytes` is
 * over quota and new ingest for it is rejected `507` — media is never purged to
 * recover space, because evidence is immutable (AGENTS.md §3.1).
 *
 * The *recomputation* of `bytes_used` is a nightly reconciliation that reads
 * authoritative usage from the Cloudinary Admin API (a permitted use under
 * AGENTS.md §3.9); it lands with the Phase 5 reconciliation job. This module is
 * the synchronous guard that reads the already-reconciled counters.
 */
import { errors } from '../types.js';

export interface QuotaCounters {
  readonly quota_bytes: number;
  readonly bytes_used: number;
}

/** Fraction of quota consumed, clamped to a sane range for display. */
export function quotaUsedFraction(org: QuotaCounters): number {
  if (org.quota_bytes <= 0) return 1;
  return org.bytes_used / org.quota_bytes;
}

/** True once an org has reached or exceeded its quota. */
export function isOverQuota(org: QuotaCounters): boolean {
  return org.bytes_used >= org.quota_bytes;
}

/**
 * Throw `507 QUOTA_EXCEEDED` if the org is at 100% or more. Callers use this
 * before admitting new storage; it never mutates or deletes anything.
 */
export function assertWithinQuota(org: QuotaCounters): void {
  if (isOverQuota(org)) {
    throw errors.quotaExceeded('org storage quota exceeded', {
      quota_bytes: org.quota_bytes,
      bytes_used: org.bytes_used,
    });
  }
}
