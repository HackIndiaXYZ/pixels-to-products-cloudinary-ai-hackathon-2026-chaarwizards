/**
 * pair-assets worker logic (Phase). Loads a project's verified
 * assets and its per-observation-type radii, runs the pure pairing algorithm,
 * and enqueues one detect-change job per candidate pair.
 *
 * The radius is ALWAYS the observation type's own `gps_radius` from
 * `projects.config`, never a global constant (§Phase 7 "bounded by gps_radius
 * from config"). A project with no configured observation types produces no
 * pairs — there is no defensible radius to cluster by.
 *
 * Enqueue is idempotent (jobId keyed on the ordered pair), so re-running the
 * worker over an unchanged window enqueues the same jobs without duplicating
 * them; the detect-change worker then dedupes at the row level via findPair.
 */
import { ProjectConfigSchema } from '@panchnama/shared';
import type { DbPort, QueuePort } from '../ports.js';
import { pairAssets, type CandidatePair, type ObservationTypeRadius } from './pairing.js';

export interface PairAssetsDeps {
  readonly db: DbPort;
  readonly queue: QueuePort;
}

export interface PairAssetsResult {
  readonly projectId: string;
  readonly assetsConsidered: number;
  readonly candidatePairs: readonly CandidatePair[];
  readonly enqueued: number;
}

export async function runPairAssets(
  deps: PairAssetsDeps,
  payload: { projectId: string },
): Promise<PairAssetsResult> {
  const { db, queue } = deps;
  const project = await db.getProjectService(payload.projectId);
  if (project === null) {
    // Not a silent drop: an unknown project is a caller error surfaced loudly.
    throw new Error(`pair-assets: project ${payload.projectId} not found`);
  }

  const config = ProjectConfigSchema.parse(project.config);
  const radii: ObservationTypeRadius[] = config.observation_types.map((o) => ({
    type: o.type,
    gps_radius: o.gps_radius,
  }));

  const assets = await db.assets.listForPairing(payload.projectId);
  const candidates = pairAssets(assets, radii);

  let enqueued = 0;
  for (const pair of candidates) {
    await queue.enqueueDetectChange({
      projectId: payload.projectId,
      orgId: project.org_id,
      beforeAssetId: pair.before_asset_id,
      afterAssetId: pair.after_asset_id,
      gpsDistanceMeters: pair.gps_distance_meters,
      timeDifferenceHours: pair.time_difference_hours,
    });
    enqueued += 1;
  }

  return {
    projectId: payload.projectId,
    assetsConsidered: assets.length,
    candidatePairs: candidates,
    enqueued,
  };
}
