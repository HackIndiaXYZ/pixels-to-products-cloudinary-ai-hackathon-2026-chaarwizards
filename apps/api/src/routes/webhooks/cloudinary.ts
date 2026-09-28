/**
 * Cloudinary upload webhook ingest (api-contracts.md §2, AGENTS.md §3.4/§3.6).
 *
 * The client is untrusted, so this handler re-verifies everything independently
 * before a row exists:
 *  1. verify the notification signature with the SDK helper (never hand-rolled);
 *  2. derive `org_id` from the signed `project_id` via a service-role lookup —
 *     NEVER from the request body's `context.org_id`;
 *  3. re-hash the delivered bytes and confirm they match the signed sha256;
 *  4. re-canonicalize the frozen EXIF (RFC 8785) and compare its hash;
 *  5. verify the Ed25519 capture signature over the re-derived payload;
 *  6. insert the asset (service role, since `assets` has no INSERT policy), set
 *     its verification state, append an audit row, and enqueue `ai-enrich`.
 *
 * Any check that fails quarantines the asset (`verification = 'failed'`,
 * `quarantined_at` set) so it is excluded from reports; every outcome — pass or
 * fail — is persisted with a reason. The enqueue is idempotent and a replayed
 * webhook upserts to the same row rather than creating a duplicate.
 */
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, fail } from '@impact/shared';
import type { SigningPayloadInput } from '@impact/shared';
import type { AssetInsert, VerificationUpdate } from '../../ports.js';
import {
  overallVerification,
  toE7,
  verifyCaptureSignature,
  verifyExifHash,
} from '../../services/verification.js';

const ContextSchema = z.object({
  capture_signature: z.string().min(1),
  device_id: z.string().min(1),
  device_public_key: z.string().min(1),
  capture_timestamp: z.string().min(1),
  capture_commit_hash: z.string().min(1),
  device_monotonic_ms: z.coerce.number().int().nonnegative(),
  gps_lat: z.coerce.number().optional(),
  gps_lon: z.coerce.number().optional(),
  gps_accuracy: z.coerce.number().optional(),
  gps_altitude: z.coerce.number().optional(),
  gps_provider: z.string().optional(),
  gps_timestamp: z.string().optional(),
  project_id: z.uuid(),
  observation_type: z.string().min(1),
  phase: z.enum(['before', 'after']),
  app_version: z.string().optional(),
  caption: z.string().optional(),
  caption_signature: z.string().optional(),
  caption_language: z.string().optional(),
  caption_created_at: z.string().optional(),
  exif_hash: z.string().min(1),
  ntp_offset_seconds: z.coerce.number().optional(),
  upload_started_at: z.string().optional(),
});

const MetadataSchema = z.object({
  sha256: z.string().min(1),
  exif: z.record(z.string(), z.unknown()).nullable().optional(),
});

const WebhookBodySchema = z.object({
  event: z.string(),
  info: z.object({
    public_id: z.string().min(1),
    asset_id: z.string().nullable().optional(),
    resource_type: z.string().optional(),
    secure_url: z.string().optional(),
    context: ContextSchema,
    metadata: MetadataSchema,
    created_at: z.string().optional(),
    bytes: z.number().optional(),
    // AI tagging from the upload preset (`categorization`/`detection`). Copied
    // into `observations` at ingest and NEVER queried back from Cloudinary
    // (AGENTS.md §3.9). Shapes are permissive: Cloudinary's analysis payload is
    // a third-party boundary.
    tags: z.array(z.string()).optional(),
    info: z
      .object({
        categorization: z.record(z.string(), z.unknown()).optional(),
        detection: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  }),
});

export async function registerCloudinaryWebhook(app: FastifyInstance): Promise<void> {
  await app.register(async (instance) => {
    // Capture the raw body: the signature is computed over the exact bytes, so a
    // re-serialized JSON object would not match (AGENTS.md §3.11).
    instance.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (_req, body, done) => {
        try {
          done(null, { raw: body as string, json: JSON.parse(body as string) as unknown });
        } catch (err) {
          done(err as Error, undefined);
        }
      },
    );

    instance.post(
      '/webhooks/cloudinary',
      { config: { rateLimit: { max: 2000, timeWindow: '1 minute' } } },
      async (request, reply) => {
        const parsed = request.body as { raw: string; json: unknown };
        const signature =
          (request.headers['x-cld-signature'] as string | undefined) ??
          (request.headers['x-cloudinary-signature'] as string | undefined);
        const timestamp =
          (request.headers['x-cld-timestamp'] as string | undefined) ?? '';

        // 1. Signature. A forged webhook is rejected before any DB work; the
        //    rejection reason is logged (there is no asset row to attach it to).
        if (
          signature === undefined ||
          !app.deps.cloudinary.verifyNotificationSignature(parsed.raw, timestamp, signature)
        ) {
          request.log.warn({ reason: 'invalid_signature' }, 'webhook rejected');
          void reply.status(401);
          return fail('UNAUTHORIZED', 'invalid webhook signature');
        }

        const body = WebhookBodySchema.parse(parsed.json);
        if (body.event !== 'upload') {
          // Not an ingest event; acknowledge without side effects.
          return ok({ ignored: true, event: body.event });
        }

        const ctx = body.info.context;
        const meta = body.info.metadata;

        // 2. Derive org_id from the SIGNED project_id, not the body context.
        const orgId = await app.deps.db.orgIdForProject(ctx.project_id);
        if (orgId === null) {
          request.log.warn({ reason: 'unknown_project' }, 'webhook rejected');
          void reply.status(404);
          return fail('NOT_FOUND', 'project not found');
        }

        // Re-derive the exact bytes the device signed.
        const capturedAtMs = Date.parse(ctx.capture_timestamp);
        const payload: SigningPayloadInput = {
          v: 1,
          sha256: meta.sha256,
          exif_hash: ctx.exif_hash,
          captured_at_ms: Number.isFinite(capturedAtMs) ? capturedAtMs : 0,
          device_monotonic_ms: ctx.device_monotonic_ms,
          gps: {
            lat_e7: ctx.gps_lat !== undefined ? toE7(ctx.gps_lat) : 0,
            lon_e7: ctx.gps_lon !== undefined ? toE7(ctx.gps_lon) : 0,
            ...(ctx.gps_accuracy !== undefined ? { accuracy_m: ctx.gps_accuracy } : {}),
            ...(ctx.gps_altitude !== undefined ? { altitude_m: ctx.gps_altitude } : {}),
            ...(ctx.gps_provider !== undefined
              ? { provider: ctx.gps_provider as SigningPayloadInput['gps']['provider'] }
              : {}),
          },
          project_id: ctx.project_id,
          observation_type: ctx.observation_type,
          phase: ctx.phase,
          caption: ctx.caption ?? null,
        };

        // 3. Byte re-hash. If the delivered bytes are fetchable, hashing them and
        //    comparing to the signed sha256 is the strongest content check.
        let shaState: 'pass' | 'fail' | 'unknown' = 'unknown';
        if (app.deps.fetchBytes !== undefined && body.info.secure_url !== undefined) {
          try {
            const bytes = await app.deps.fetchBytes(body.info.secure_url);
            const computed = createHash('sha256').update(bytes).digest('hex');
            shaState = computed === meta.sha256 ? 'pass' : 'fail';
          } catch {
            shaState = 'unknown';
          }
        } else {
          // Structural fallback: the content-addressed public_id must carry the
          // same sha256 the device committed. Not a byte re-hash, so `unknown`
          // rather than a false `pass` (AGENTS.md §3.7) when it merely matches.
          const publicIdSha = body.info.public_id.split('/').pop();
          shaState =
            publicIdSha === meta.sha256 && meta.sha256 === ctx.capture_commit_hash
              ? 'unknown'
              : 'fail';
        }

        // 4 + 5. EXIF hash and Ed25519 capture signature.
        const exifState = verifyExifHash(meta.exif ?? null, ctx.exif_hash);
        const sigState = verifyCaptureSignature(
          payload,
          ctx.capture_signature,
          ctx.device_public_key,
        );

        const verification = overallVerification([shaState, exifState, sigState]);
        const nowIso = new Date().toISOString();

        // 6. Idempotent insert. A replayed webhook finds the existing row and
        //    does not create a duplicate (Phase 3 idempotency task).
        const existing = await app.deps.db.assets.findBySha(meta.sha256, ctx.project_id);
        const insert: AssetInsert = {
          project_id: ctx.project_id,
          org_id: orgId,
          cloudinary_public_id: body.info.public_id,
          cloudinary_asset_id: body.info.asset_id ?? null,
          asset_type: body.info.resource_type === 'video' ? 'video' : 'image',
          device_capture_timestamp: ctx.capture_timestamp,
          device_commit_hash: ctx.capture_commit_hash,
          device_id: ctx.device_id,
          device_public_key: ctx.device_public_key,
          capture_signature: ctx.capture_signature,
          device_monotonic_ms: ctx.device_monotonic_ms,
          ntp_offset_seconds: ctx.ntp_offset_seconds ?? null,
          gps_lat: ctx.gps_lat ?? null,
          gps_lon: ctx.gps_lon ?? null,
          gps_accuracy_meters: ctx.gps_accuracy ?? null,
          gps_altitude: ctx.gps_altitude ?? null,
          gps_provider: ctx.gps_provider ?? null,
          caption: ctx.caption ?? null,
          caption_signature: ctx.caption_signature ?? null,
          caption_language: ctx.caption_language ?? null,
          caption_created_at: ctx.caption_created_at ?? null,
          exif: meta.exif ?? null,
          exif_hash: ctx.exif_hash,
          sha256_hash: meta.sha256,
          observation_type: ctx.observation_type,
          phase: ctx.phase,
          app_version: ctx.app_version ?? null,
          server_upload_timestamp: body.info.created_at ?? null,
          upload_started_at: ctx.upload_started_at ?? null,
          signature_tier: 'device',
        };

        const asset = existing ?? (await app.deps.db.assets.insert(insert));

        const update: VerificationUpdate = {
          verification,
          upload_status: verification === 'passed' ? 'verified' : 'flagged',
          ...(verification === 'passed' ? { verified_at: nowIso } : {}),
          ...(verification === 'failed' ? { quarantined_at: nowIso } : {}),
          ...(exifState === 'pass' ? { exif_verified_at: nowIso } : {}),
          ...(sigState === 'pass' ? { caption_verified_at: nowIso } : {}),
          signature_tier: 'device',
        };
        await app.deps.db.assets.setVerification(asset.id, update);

        // Persist the outcome to the audit chain — pass or fail, with reasons.
        await app.deps.db.audit.append({
          assetId: asset.id,
          action: existing ? 'webhook_replay' : 'ingest',
          actorType: 'system',
          actorId: 'cloudinary',
          details: {
            verification,
            checks: { sha256: shaState, exif_hash: exifState, capture_signature: sigState },
            public_id: body.info.public_id,
          },
        });

        // Only enqueue enrichment on a fresh, non-quarantined asset. The jobId is
        // keyed on the asset, so a replay cannot double-enqueue.
        if (existing === null && verification !== 'failed') {
          await app.deps.queue.enqueueAiEnrich({ assetId: asset.id, orgId });
        }

        // Copy Cloudinary AI tags into Postgres `observations` at ingest (§3.9).
        // Tags are write-only to us: we store them here and never query Cloudinary
        // back for them. Only on a fresh, non-quarantined asset, and only when the
        // preset actually returned something to record.
        const tags = body.info.tags ?? [];
        const categorization = body.info.info?.categorization;
        const detection = body.info.info?.detection;
        const hasTags =
          tags.length > 0 || categorization !== undefined || detection !== undefined;
        if (existing === null && verification !== 'failed' && hasTags) {
          await app.deps.db.observations.insert({
            asset_id: asset.id,
            project_id: ctx.project_id,
            org_id: orgId,
            observation_type: ctx.observation_type,
            metrics: {
              tags,
              ...(categorization !== undefined ? { categorization } : {}),
              ...(detection !== undefined ? { detection } : {}),
            },
            notes: 'cloudinary_ai_tags',
          });
        }

        return ok({
          asset_id: asset.id,
          verification,
          upload_status: update.upload_status,
          quarantined: verification === 'failed',
        });
      },
    );
  });
}
