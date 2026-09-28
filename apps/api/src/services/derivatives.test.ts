/**
 * Phase 5 gate — derivative writer.
 *
 * Covers the gate bullets:
 *  - derivative rows link to their parent and the audit chain records the event;
 *  - a gen-AI call is rejected when the source is not a report derivative (§3.1);
 *  - a generative transform is registered async and reported `pending` (never
 *    fetched synchronously, §3.11);
 *  - the original asset row is never mutated by creating a derivative (§3.1).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createDerivative, type CreateDerivativeDeps } from './derivatives.js';
import { GENERATIVE_TRANSFORMS, NAMED_TRANSFORMS } from '../lib/transformations.js';
import {
  ORG_A,
  makeFakeDb,
  makeFakeCloudinary,
  type FakeDb,
} from '../testing/fakes.js';

function deps(db: FakeDb, cloudinary = makeFakeCloudinary()): CreateDerivativeDeps {
  return { cloudinary, derivatives: db.derivatives, audit: db.audit, assets: db.assets };
}

describe('createDerivative', () => {
  let db: FakeDb;
  let assetId: string;

  beforeEach(() => {
    db = makeFakeDb();
    const project = db.seedProject({ org_id: ORG_A });
    assetId = db.seedAsset({ org_id: ORG_A, project_id: project.id, sha256_hash: 'abc' }).id;
  });

  it('creates a derivative linked to its parent and appends an audit row', async () => {
    const res = await createDerivative(deps(db), {
      parentAssetId: assetId,
      transformation: NAMED_TRANSFORMS.report_full,
      kind: 'report_full',
      isGenerative: false,
    });
    expect(res.derivative.parent_asset_id).toBe(assetId);
    expect(res.derivative.is_generative).toBe(false);
    expect(res.derivative.org_id).toBe(ORG_A);
    expect(res.pending).toBe(false);
    expect(res.secureUrl).not.toBeNull();

    const auditRow = db._audit.find((a) => a.assetId === assetId && a.action === 'derivative_created');
    expect(auditRow).toBeDefined();
  });

  it('does not mutate the original asset row (§3.1)', async () => {
    const before = { ...(db._assets.get(assetId) as object) };
    await createDerivative(deps(db), {
      parentAssetId: assetId,
      transformation: NAMED_TRANSFORMS.report_thumb,
      kind: 'report_thumb',
      isGenerative: false,
    });
    expect({ ...(db._assets.get(assetId) as object) }).toEqual(before);
  });

  it('rejects a generative transform whose source is not a report derivative (§3.1)', async () => {
    // A non-report derivative (kind = 'clip') is not a valid generative source.
    const source = db.seedDerivative({
      parent_asset_id: assetId,
      org_id: ORG_A,
      kind: 'clip',
      transformation: 'so_0,eo_5',
    });
    await expect(
      createDerivative(deps(db), {
        parentAssetId: assetId,
        transformation: GENERATIVE_TRANSFORMS.remove_person,
        kind: 'gen_privacy',
        isGenerative: true,
        sourceDerivativeId: source.id,
      }),
    ).rejects.toMatchObject({ code: 'UNPROCESSABLE' });
  });

  it('rejects a generative transform applied directly to an original', async () => {
    await expect(
      createDerivative(deps(db), {
        parentAssetId: assetId,
        transformation: GENERATIVE_TRANSFORMS.background_replace,
        kind: 'gen',
        isGenerative: true,
        // no sourceDerivativeId → cannot be a report copy
      }),
    ).rejects.toMatchObject({ code: 'UNPROCESSABLE' });
  });

  it('rejects a generative string not declared is_generative', async () => {
    await expect(
      createDerivative(deps(db), {
        parentAssetId: assetId,
        transformation: GENERATIVE_TRANSFORMS.quality_restore,
        kind: 'report_full',
        isGenerative: false,
      }),
    ).rejects.toMatchObject({ code: 'UNPROCESSABLE' });
  });

  it('allows a generative transform on a report derivative and reports it pending (§3.11)', async () => {
    const report = db.seedDerivative({
      parent_asset_id: assetId,
      org_id: ORG_A,
      kind: 'report_full',
      transformation: NAMED_TRANSFORMS.report_full,
      public_id: `${ORG_A}/proj/report_full`,
    });
    const res = await createDerivative(deps(db), {
      parentAssetId: assetId,
      transformation: GENERATIVE_TRANSFORMS.remove_text,
      kind: 'gen_privacy',
      isGenerative: true,
      sourceDerivativeId: report.id,
    });
    // Generative work is async: pending, no synchronous URL, but the row exists.
    expect(res.pending).toBe(true);
    expect(res.secureUrl).toBeNull();
    expect(res.derivative.is_generative).toBe(true);
    expect(res.derivative.parent_asset_id).toBe(assetId);
  });
});
