import { describe, expect, it } from 'vitest';
import { runPairAssets } from './pair-assets.js';
import { runDetectChange, NO_MODEL_VERSION } from './change-detection.js';
import {
  ORG_A,
  makeFakeDb,
  makeFakeCloudinary,
  makeFakeQueue,
  makeFakeMl,
  type FakeDb,
} from '../testing/fakes.js';

const PROJECT_CONFIG = {
  observation_types: [{ type: 'planting', model: 'forestry', gps_radius: 5 }],
};

interface Seeded {
  db: FakeDb;
  projectId: string;
  beforeId: string;
  afterId: string;
}

function seed(): Seeded {
  const db = makeFakeDb();
  const project = db.seedProject({ org_id: ORG_A, sector: 'forestry', config: PROJECT_CONFIG });
  const before = db.seedAsset({
    org_id: ORG_A,
    project_id: project.id,
    phase: 'before',
    observation_type: 'planting',
    device_capture_timestamp: '2024-01-15T09:00:00.000Z',
    upload_status: 'verified',
    gps_lat: 19.1234,
    gps_lon: 72.8765,
  });
  const after = db.seedAsset({
    org_id: ORG_A,
    project_id: project.id,
    phase: 'after',
    observation_type: 'planting',
    device_capture_timestamp: '2024-01-15T12:00:00.000Z',
    upload_status: 'verified',
    gps_lat: 19.1234,
    gps_lon: 72.8765,
  });
  return { db, projectId: project.id, beforeId: before.id, afterId: after.id };
}

describe('runPairAssets', () => {
  it('enqueues a detect-change job per candidate pair', async () => {
    const { db, projectId, beforeId, afterId } = seed();
    const queue = makeFakeQueue();
    const result = await runPairAssets({ db, queue }, { projectId });
    expect(result.candidatePairs).toHaveLength(1);
    expect(queue._detectJobs).toEqual([{ beforeAssetId: beforeId, afterAssetId: afterId }]);
  });

  it('only considers verified assets', async () => {
    const db = makeFakeDb();
    const project = db.seedProject({ org_id: ORG_A, sector: 'forestry', config: PROJECT_CONFIG });
    db.seedAsset({
      org_id: ORG_A,
      project_id: project.id,
      phase: 'before',
      observation_type: 'planting',
      upload_status: 'pending', // not verified → excluded
      gps_lat: 19.1234,
      gps_lon: 72.8765,
    });
    db.seedAsset({
      org_id: ORG_A,
      project_id: project.id,
      phase: 'after',
      observation_type: 'planting',
      upload_status: 'verified',
      gps_lat: 19.1234,
      gps_lon: 72.8765,
    });
    const queue = makeFakeQueue();
    const result = await runPairAssets({ db, queue }, { projectId: project.id });
    expect(result.candidatePairs).toHaveLength(0);
  });

  it('re-running over an unchanged window enqueues no duplicate jobs (idempotent)', async () => {
    const { db, projectId } = seed();
    const queue = makeFakeQueue();
    await runPairAssets({ db, queue }, { projectId });
    await runPairAssets({ db, queue }, { projectId });
    expect(queue._detectJobs).toHaveLength(1);
  });
});

describe('runDetectChange — success path', () => {
  it('persists a detected change_event with the model_version and diff', async () => {
    const { db, projectId, beforeId, afterId } = seed();
    const outcome = await runDetectChange(
      { db, ml: makeFakeMl(), cloudinary: makeFakeCloudinary() },
      { projectId, orgId: ORG_A, beforeAssetId: beforeId, afterAssetId: afterId, gpsDistanceMeters: 2.1 },
    );
    expect(outcome.kind).toBe('detected');
    const ev = outcome.changeEvent;
    expect(ev.status).toBe('detected');
    expect(ev.model_version).toBe('v1-placeholder');
    expect(ev.diff_asset_cloudinary_id).toContain('diff');
    expect(ev.gps_distance_meters).toBe(2.1);
    expect(ev.change_metrics.saplings_planted).toBe(49);
  });
});

describe('runDetectChange — gate: an ML failure produces a failed change_event, not a missing row', () => {
  it('records status=failed with a reason when the ML call throws', async () => {
    const { db, projectId, beforeId, afterId } = seed();
    const outcome = await runDetectChange(
      { db, ml: makeFakeMl({ throwError: true }), cloudinary: makeFakeCloudinary() },
      { projectId, orgId: ORG_A, beforeAssetId: beforeId, afterAssetId: afterId },
    );
    expect(outcome.kind).toBe('failed');
    expect(outcome.changeEvent.status).toBe('failed');
    expect(outcome.changeEvent.failure_reason).toContain('ml service call failed');
    expect(outcome.changeEvent.model_version).toBe(NO_MODEL_VERSION);
    // The row exists — it was not dropped.
    expect(db._changeEvents.size).toBe(1);
  });

  it('records status=failed for an unsupported sector (§3.3, no cross-sector fallback)', async () => {
    const { db, projectId, beforeId, afterId } = seed();
    const outcome = await runDetectChange(
      { db, ml: makeFakeMl({ response: { status: 'unsupported' } }), cloudinary: makeFakeCloudinary() },
      { projectId, orgId: ORG_A, beforeAssetId: beforeId, afterAssetId: afterId },
    );
    expect(outcome.kind).toBe('failed');
    expect(outcome.changeEvent.failure_reason).toContain('unsupported');
  });

  it('records status=failed when metrics arrive without a model_version (§3.2)', async () => {
    const { db, projectId, beforeId, afterId } = seed();
    const outcome = await runDetectChange(
      {
        db,
        ml: makeFakeMl({ response: { change_type: 'x', change_metrics: { saplings_planted: 1 }, confidence: 0.5 } }),
        cloudinary: makeFakeCloudinary(),
      },
      { projectId, orgId: ORG_A, beforeAssetId: beforeId, afterAssetId: afterId },
    );
    expect(outcome.kind).toBe('failed');
    expect(outcome.changeEvent.failure_reason).toContain('model_version');
  });
});

describe('runDetectChange — gate: an off-schema metric is rejected, naming the key', () => {
  it('records status=failed and names the offending key, and does not store it', async () => {
    const { db, projectId, beforeId, afterId } = seed();
    const outcome = await runDetectChange(
      {
        db,
        ml: makeFakeMl({
          response: {
            change_type: 'sapling_planting',
            change_metrics: { saplings_planted: 49, bogus_metric: 7 },
            model_version: 'v1-placeholder',
            confidence: 0.9,
          },
        }),
        cloudinary: makeFakeCloudinary(),
      },
      { projectId, orgId: ORG_A, beforeAssetId: beforeId, afterAssetId: afterId },
    );
    expect(outcome.kind).toBe('failed');
    expect(outcome.changeEvent.failure_reason).toContain('bogus_metric');
    // The off-schema metric is not persisted (§3.2).
    expect(outcome.changeEvent.change_metrics).toEqual({});
  });
});

describe('runDetectChange — gate: pairing is idempotent', () => {
  it('a second run over the same pair creates no duplicate row', async () => {
    const { db, projectId, beforeId, afterId } = seed();
    const deps = { db, ml: makeFakeMl(), cloudinary: makeFakeCloudinary() };
    const first = await runDetectChange(deps, {
      projectId,
      orgId: ORG_A,
      beforeAssetId: beforeId,
      afterAssetId: afterId,
    });
    const second = await runDetectChange(deps, {
      projectId,
      orgId: ORG_A,
      beforeAssetId: beforeId,
      afterAssetId: afterId,
    });
    expect(first.kind).toBe('detected');
    expect(second.kind).toBe('skipped');
    expect(db._changeEvents.size).toBe(1);
  });
});
