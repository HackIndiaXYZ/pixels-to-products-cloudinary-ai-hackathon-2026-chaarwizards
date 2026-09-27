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

export function createQueue(config: Config): QueuePort {
  const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const aiEnrich = new Queue(AI_ENRICH_QUEUE, { connection });

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
    async ping() {
      await connection.ping();
    },
    async close() {
      await aiEnrich.close();
      connection.disconnect();
    },
  };
}
