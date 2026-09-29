/**
 * Pairing & change-detection worker entrypoint (BUILD_ORDER Phase 7). Starts the
 * BullMQ consumers for the `pair-assets` and `detect-change` queues, wiring the
 * real Supabase DB, Cloudinary, ML client, and queue. Intended to run as a
 * long-lived process alongside the API, never inside a request path.
 *
 * The processing logic lives in the pure services (`pair-assets.ts`,
 * `change-detection.ts`); this file is only the transport wiring, so the logic
 * is unit-tested without Redis.
 */
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { loadConfig } from '../config.js';
import { createSupabaseDb } from '../plugins/supabase.js';
import { configureCloudinary, createCloudinaryAdapter } from '../plugins/cloudinary.js';
import { createQueue, PAIR_ASSETS_QUEUE, DETECT_CHANGE_QUEUE, REPORT_GENAI_QUEUE } from '../plugins/queue.js';
import { createMlClient } from '../services/ml-client.js';
import { runPairAssets } from '../services/pair-assets.js';
import { runDetectChange } from '../services/change-detection.js';
import { runReportGenAi, type ReportGenAiPayload } from '../services/report-genai.js';

function main(): void {
  const config = loadConfig();
  const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const db = createSupabaseDb(config);
  configureCloudinary(config);
  const cloudinary = createCloudinaryAdapter(config);
  const ml = createMlClient(config);
  const queue = createQueue(config);

  const pairWorker = new Worker(
    PAIR_ASSETS_QUEUE,
    async (job: Job<{ projectId: string; orgId: string }>) => {
      const result = await runPairAssets({ db, queue }, { projectId: job.data.projectId });
      console.log(
        JSON.stringify({
          msg: 'pair_assets_complete',
          project_id: result.projectId,
          assets: result.assetsConsidered,
          candidates: result.candidatePairs.length,
          enqueued: result.enqueued,
        }),
      );
    },
    { connection },
  );

  const detectWorker = new Worker(
    DETECT_CHANGE_QUEUE,
    async (
      job: Job<{
        projectId: string;
        orgId: string;
        beforeAssetId: string;
        afterAssetId: string;
        gpsDistanceMeters: number | null;
        timeDifferenceHours: number | null;
      }>,
    ) => {
      const outcome = await runDetectChange(
        { db, ml, cloudinary },
        {
          projectId: job.data.projectId,
          orgId: job.data.orgId,
          beforeAssetId: job.data.beforeAssetId,
          afterAssetId: job.data.afterAssetId,
          gpsDistanceMeters: job.data.gpsDistanceMeters,
          timeDifferenceHours: job.data.timeDifferenceHours,
        },
      );
      console.log(
        JSON.stringify({
          msg: 'detect_change_complete',
          kind: outcome.kind,
          change_event_id: outcome.changeEvent.id,
        }),
      );
    },
    { connection },
  );

  // Gen-AI social variants (Phase 9): applied to report-copy derivatives only
  // (§3.1), asynchronously, out of the request path (§3.11).
  const genAiWorker = new Worker(
    REPORT_GENAI_QUEUE,
    async (job: Job<ReportGenAiPayload>) => {
      const outcomes = await runReportGenAi(
        { cloudinary, derivatives: db.derivatives, assets: db.assets, audit: db.audit },
        job.data,
      );
      console.log(
        JSON.stringify({
          msg: 'report_genai_complete',
          report_id: job.data.reportId,
          created: outcomes.length,
          pending: outcomes.filter((o) => !o.ready).length,
        }),
      );
    },
    { connection },
  );

  // A job that throws is retried by BullMQ and, on final failure, left on the
  // failed set with its reason — never silently dropped (§3.6).
  for (const [name, worker] of [
    ['pair-assets', pairWorker],
    ['detect-change', detectWorker],
    ['report-genai', genAiWorker],
  ] as const) {
    worker.on('failed', (job, err) => {
      console.error(
        JSON.stringify({ msg: `${name}_job_failed`, job_id: job?.id, reason: err.message }),
      );
    });
  }

  console.log(
    JSON.stringify({
      msg: 'workers_started',
      queues: [PAIR_ASSETS_QUEUE, DETECT_CHANGE_QUEUE, REPORT_GENAI_QUEUE],
    }),
  );
}

main();
