/**
 * Nightly reconciliation job (BUILD_ORDER Phase 5: "Reconciliation job" +
 * resolves the Phase 3 quota carry-over: recomputing `orgs.bytes_used`).
 *
 * This is one of only two sanctioned Cloudinary Admin API uses (AGENTS.md §3.9):
 * a ONE-WAY integrity check. It lists what Cloudinary stores, joins it against
 * Postgres (the system of record), and reports:
 *   - orphans:  a Cloudinary asset with no owning row in `assets`/`asset_derivatives`;
 *   - missing:  a row whose Cloudinary bytes are gone.
 * It NEVER serves a product read from this listing, and it deletes nothing here —
 * deletion is a separate, reference-checked step (ARCHITECTURE.md §3.2 retention).
 *
 * It also recomputes each org's authoritative byte usage from the Cloudinary
 * totals, which the synchronous quota guard (`services/quota.ts`) then reads.
 */
import type { CloudinaryAdminPort, DbPort } from '../ports.js';

export interface ReconciliationDeps {
  readonly admin: CloudinaryAdminPort;
  readonly db: DbPort;
}

export interface ReconciliationReport {
  readonly checkedResources: number;
  readonly knownPublicIds: number;
  /** In Cloudinary, no owning DB row — investigate/candidate for deletion. */
  readonly orphans: readonly string[];
  /** In the DB, but no matching Cloudinary resource — a lost original. */
  readonly missing: readonly string[];
  /** Recomputed `orgs.bytes_used`, keyed by org id. */
  readonly bytesUsedByOrg: Readonly<Record<string, number>>;
}

export async function reconcile(deps: ReconciliationDeps): Promise<ReconciliationReport> {
  const [resources, assetIds, derivativeIds] = await Promise.all([
    deps.admin.listAllResources(),
    deps.db.listAssetPublicIds(),
    deps.db.listDerivativePublicIds(),
  ]);

  // public_id -> owning org, across originals and derivatives.
  const owner = new Map<string, string>();
  for (const a of assetIds) owner.set(a.public_id, a.org_id);
  for (const d of derivativeIds) owner.set(d.public_id, d.org_id);

  const cloudinaryIds = new Set<string>();
  const bytesUsedByOrg: Record<string, number> = {};
  const orphans: string[] = [];

  for (const r of resources) {
    cloudinaryIds.add(r.public_id);
    const org = owner.get(r.public_id);
    if (org === undefined) {
      // No owning row: a stray asset that our system of record does not know.
      orphans.push(r.public_id);
      continue;
    }
    bytesUsedByOrg[org] = (bytesUsedByOrg[org] ?? 0) + r.bytes;
  }

  // A DB row whose bytes are gone from Cloudinary is a lost original — reported,
  // never silently healed.
  const missing: string[] = [];
  for (const a of assetIds) {
    if (!cloudinaryIds.has(a.public_id)) missing.push(a.public_id);
  }

  // Persist the authoritative usage the quota guard reads. Every org that owns a
  // resource is written, including those that reconciled to zero.
  const orgsToWrite = new Set<string>([...Object.keys(bytesUsedByOrg), ...owner.values()]);
  await Promise.all(
    [...orgsToWrite].map((org) => deps.db.setOrgBytesUsed(org, bytesUsedByOrg[org] ?? 0)),
  );

  return {
    checkedResources: resources.length,
    knownPublicIds: owner.size,
    orphans,
    missing,
    bytesUsedByOrg,
  };
}
