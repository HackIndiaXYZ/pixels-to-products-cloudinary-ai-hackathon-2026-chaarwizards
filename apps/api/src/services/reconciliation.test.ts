/**
 * Phase 5 gate — reconciliation job.
 *
 * Covers the gate bullet "reconciliation finds a deliberately orphaned Cloudinary
 * asset", plus the missing-row direction and the `orgs.bytes_used` recompute that
 * resolves the Phase 3 quota carry-over.
 */
import { describe, expect, it } from 'vitest';
import { reconcile } from './reconciliation.js';
import { ORG_A, makeFakeDb, makeFakeCloudinaryAdmin } from '../testing/fakes.js';
import type { CloudinaryResource } from '../ports.js';

function resource(publicId: string, bytes: number): CloudinaryResource {
  return {
    public_id: publicId,
    asset_id: `cld-${publicId}`,
    bytes,
    created_at: '2026-01-01T00:00:00Z',
    resource_type: 'image',
  };
}

describe('reconcile', () => {
  it('flags a Cloudinary asset with no owning DB row as an orphan', async () => {
    const db = makeFakeDb();
    const org = await db.orgs.create({ name: 'Org A', type: 'ngo' });
    const project = db.seedProject({ org_id: org.id });
    const asset = db.seedAsset({
      org_id: org.id,
      project_id: project.id,
      cloudinary_public_id: `${org.id}/proj/known`,
    });
    void asset;

    const admin = makeFakeCloudinaryAdmin([
      resource(`${org.id}/proj/known`, 1000),
      resource(`${org.id}/proj/ORPHAN`, 500), // deliberately not in the DB
    ]);

    const report = await reconcile({ db, admin });
    expect(report.orphans).toContain(`${org.id}/proj/ORPHAN`);
    expect(report.orphans).not.toContain(`${org.id}/proj/known`);
  });

  it('flags a DB asset with no Cloudinary resource as missing', async () => {
    const db = makeFakeDb();
    const org = await db.orgs.create({ name: 'Org A', type: 'ngo' });
    const project = db.seedProject({ org_id: org.id });
    db.seedAsset({
      org_id: org.id,
      project_id: project.id,
      cloudinary_public_id: `${org.id}/proj/lost`,
    });

    const admin = makeFakeCloudinaryAdmin([]); // Cloudinary has nothing
    const report = await reconcile({ db, admin });
    expect(report.missing).toContain(`${org.id}/proj/lost`);
  });

  it('recomputes orgs.bytes_used from Cloudinary totals', async () => {
    const db = makeFakeDb();
    const org = await db.orgs.create({ name: 'Org A', type: 'ngo' });
    const project = db.seedProject({ org_id: org.id });
    db.seedAsset({ org_id: org.id, project_id: project.id, cloudinary_public_id: `${org.id}/a` });
    db.seedAsset({ org_id: org.id, project_id: project.id, cloudinary_public_id: `${org.id}/b` });

    const admin = makeFakeCloudinaryAdmin([
      resource(`${org.id}/a`, 2000),
      resource(`${org.id}/b`, 3000),
    ]);
    const report = await reconcile({ db, admin });
    expect(report.bytesUsedByOrg[org.id]).toBe(5000);
    expect(db._orgs.get(org.id)?.bytes_used).toBe(5000);
  });

  it('ignores org id A vs B leakage: bytes are summed per owning org', async () => {
    const db = makeFakeDb();
    const project = db.seedProject({ org_id: ORG_A });
    db.seedAsset({ org_id: ORG_A, project_id: project.id, cloudinary_public_id: `${ORG_A}/x` });
    const admin = makeFakeCloudinaryAdmin([resource(`${ORG_A}/x`, 4242)]);
    const report = await reconcile({ db, admin });
    expect(report.bytesUsedByOrg[ORG_A]).toBe(4242);
  });
});
