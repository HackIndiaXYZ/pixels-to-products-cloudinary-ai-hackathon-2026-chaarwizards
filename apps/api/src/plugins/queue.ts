/**
 * BullMQ queue adapter. The webhook enqueues `ai-enrich` after a successful
 * ingest; generative/enrichment work is asynchronous and never blocks the
 * request (AGENTS.md §3.11). The Redis connection backs both enqueue and the
 * readiness probe.
 */
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { Config } from '../config.js';
import type { QueuePort } from '../ports.js';

export const AI_ENRICH_QUEUE = 'ai-enrich' as const;
export const PAIR_ASSETS_QUEUE = 'pair-assets' as const;
export const DETECT_CHANGE_QUEUE = 'detect-change' as const;
export const REPORT_GENAI_QUEUE = 'report-genai' as const;

export function createQueue(config: Config): QueuePort {
  const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const aiEnrich = new Queue(AI_ENRICH_QUEUE, { connection });
  const pairAssets = new Queue(PAIR_ASSETS_QUEUE, { connection });
  const detectChange = new Queue(DETECT_CHANGE_QUEUE, { connection });
  const reportGenAi = new Queue(REPORT_GENAI_QUEUE, { connection });

  return {
    async enqueueAiEnrich(payload) {
      // jobId keyed on the asset makes the enqueue idempotent: replaying a
      // webhook cannot create a duplicate job (Phase 3 idempotency task).
      await aiEnrich.add('enrich', payload, {
        jobId: `ai-enrich:${payload.assetId}`,
        removeOnComplete: true,
        removeOnFail: false,
      });
    },
    async enqueuePairAssets(payload) {
      // Keyed on the project so a burst of triggers coalesces into one pass.
      await pairAssets.add('pair', payload, {
        jobId: `pair-assets:${payload.projectId}`,
        removeOnComplete: true,
        removeOnFail: false,
      });
    },
    async enqueueDetectChange(payload) {
      // Keyed on the ordered pair so a replay never doubles a detection job
      // (Phase 7 idempotency). Row-level dedupe is a second guard in the worker.
      await detectChange.add('detect', payload, {
        jobId: `detect-change:${payload.beforeAssetId}:${payload.afterAssetId}`,
        removeOnComplete: true,
        removeOnFail: false,
      });
    },
    async enqueueReportGenAi(payload) {
      // Keyed on the report so re-triggering generation coalesces the gen-AI
      // pass. Gen-AI is async (420/423), so it never runs in the request (§3.11).
      await reportGenAi.add('genai', payload, {
        jobId: `report-genai:${payload.reportId}`,
        removeOnComplete: true,
        removeOnFail: false,
      });
    },
    async ping() {
      await connection.ping();
    },
    async close() {
      await aiEnrich.close();
      await pairAssets.close();
      await detectChange.close();
      await reportGenAi.close();
      connection.disconnect();
    },
  };
}
