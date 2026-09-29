import { describe, it, expect } from 'vitest';
import { makeFakeDb, makeFakeCloudinary, ORG_A } from '../testing/fakes.js';
import { runReportGenAi } from './report-genai.js';
import { GENERATIVE_TRANSFORMS } from '../lib/transformations.js';

describe('runReportGenAi (Phase 9 gen-AI job gate)', () => {
  function setup() {
    const db = makeFakeDb();
    const cloudinary = makeFakeCloudinary({ generativePending: false });
    const project = db.seedProject({ org_id: ORG_A, name: 'P', sector: 'forestry' });
    const asset = db.seedAsset({
      org_id: ORG_A,
      project_id: project.id,
      cloudinary_public_id: `${ORG_A}/orig/before`,
      upload_status: 'verified',
    });
    // The report copy the gen-AI edit is applied to (a report_full derivative).
    const reportCopy = db.seedDerivative({
      parent_asset_id: asset.id,
      org_id: ORG_A,
      kind: 'report_full',
      public_id: `${ORG_A}/orig/before/report_full`,
    });
    return { db, cloudinary, asset, reportCopy };
  }

  it('GATE: every derivative created is generative AND carries a parent link', async () => {
    const { db, cloudinary, asset, reportCopy } = setup();
    const outcomes = await runReportGenAi(
      { cloudinary, derivatives: db.derivatives, assets: db.assets, audit: db.audit },
      {
        reportId: 'report-1',
        orgId: ORG_A,
        edits: [
          {
            parentAssetId: asset.id,
            sourceDerivativeId: reportCopy.id,
            transformation: GENERATIVE_TRANSFORMS.landscape_expand,
            kind: 'report_social',
          },
        ],
      },
    );

    expect(outcomes.length).toBe(1);
    const created = db.derivatives.getById(outcomes[0]!.derivativeId);
    const row = await created;
    expect(row).not.toBeNull();
    expect(row!.is_generative).toBe(true);
    expect(row!.parent_asset_id).toBe(asset.id);
  });

  it('GATE: a gen-AI edit is applied to the report copy, never the original public_id', async () => {
    const { db, cloudinary, asset, reportCopy } = setup();
    await runReportGenAi(
      { cloudinary, derivatives: db.derivatives, assets: db.assets, audit: db.audit },
      {
        reportId: 'report-1',
        orgId: ORG_A,
        edits: [
          {
            parentAssetId: asset.id,
            sourceDerivativeId: reportCopy.id,
            transformation: GENERATIVE_TRANSFORMS.landscape_expand,
            kind: 'report_social',
          },
        ],
      },
    );
    const genCall = cloudinary._eagerCalls.find((c) => c.isGenerative);
    expect(genCall).toBeDefined();
    // Applied to the report copy...
    expect(genCall!.sourcePublicId).toBe(reportCopy.public_id);
    // ...and NEVER the raw evidence public_id (§3.1).
    expect(genCall!.sourcePublicId).not.toBe(asset.cloudinary_public_id);
  });

  it('refuses a generative edit whose source is not a report derivative (§3.1)', async () => {
    const { db, cloudinary, asset } = setup();
    // A derivative that is NOT a report copy (kind = thumbnail).
    const notReport = db.seedDerivative({
      parent_asset_id: asset.id,
      org_id: ORG_A,
      kind: 'thumbnail',
      public_id: `${ORG_A}/orig/before/thumb`,
    });
    await expect(
      runReportGenAi(
        { cloudinary, derivatives: db.derivatives, assets: db.assets, audit: db.audit },
        {
          reportId: 'r',
          orgId: ORG_A,
          edits: [
            {
              parentAssetId: asset.id,
              sourceDerivativeId: notReport.id,
              transformation: GENERATIVE_TRANSFORMS.landscape_expand,
              kind: 'report_social',
            },
          ],
        },
      ),
    ).rejects.toMatchObject({ statusCode: 422 });
  });
});
