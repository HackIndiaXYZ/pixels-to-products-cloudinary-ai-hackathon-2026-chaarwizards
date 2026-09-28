import { describe, expect, it } from 'vitest';
import { sha256Canonical } from '@impact/shared/rn';
import type { SigningPayloadInput } from '@impact/shared/rn';
import { performCapture, type CaptureContext } from './capture.js';
import { CaptureQueue } from './queue.js';
import { verifyLocalCapture } from './signing.js';
import { fixToSigningGps } from './gps.js';
import type { GpsFix } from './ports.js';
import {
  BufferChunkReader,
  FakeClock,
  InMemoryKeyValueStore,
  NodeEd25519Signer,
  StaticExifReader,
  deterministicQueueDeps,
} from './testing/fakes.js';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';

const RAW_EXIF = {
  Make: 'Apple',
  Model: 'iPhone 15 Pro',
  Orientation: 1,
  Software: 'should-be-stripped',
  DateTimeOriginal: '2024:01:15 09:30:00',
};

const GOOD_FIX: GpsFix = {
  lat: 19.1234,
  lon: 72.8765,
  accuracy_m: 4,
  altitude_m: 10.5,
  provider: 'fused',
};

const FILE_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

function makeContext(signer = new NodeEd25519Signer('device')): {
  ctx: CaptureContext;
  queue: CaptureQueue;
  signer: NodeEd25519Signer;
} {
  const queue = new CaptureQueue(new InMemoryKeyValueStore(), deterministicQueueDeps());
  const ctx: CaptureContext = {
    exifReader: new StaticExifReader(RAW_EXIF),
    fileReader: new BufferChunkReader(FILE_BYTES),
    signer,
    clock: new FakeClock(1_700_000_000_000),
    queue,
  };
  return { ctx, queue, signer };
}

const baseInput = {
  selection: { projectId: PROJECT, observationType: 'planting', phase: 'before' as const },
  orgId: ORG,
  fileUri: 'file://capture.jpg',
  assetType: 'image' as const,
  gpsFix: GOOD_FIX,
  appVersion: '1.0.0',
  caption: 'Planted 50 saplings',
};

describe('performCapture', () => {
  it('enqueues a signed capture whose exif_hash matches the server JCS re-hash', async () => {
    const { ctx, queue } = makeContext();
    const result = await performCapture(ctx, baseInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const item = queue.get(result.item.id);
    expect(item?.state).toBe('queued');

    const meta = item?.request.metadata as { sha256: string; exif: Record<string, unknown> };
    // Frozen EXIF was uploaded — editable tags stripped.
    expect(meta.exif).not.toHaveProperty('Software');
    expect(meta.exif).not.toHaveProperty('DateTimeOriginal');
    // exif_hash in the context equals the server's independent JCS hash.
    expect(item?.request.context['exif_hash']).toBe(sha256Canonical(meta.exif));
  });

  it('signs a payload that verifies locally with the device public key', async () => {
    const { ctx, queue } = makeContext();
    const result = await performCapture(ctx, baseInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = queue.get(result.item.id);
    const ctxObj = item?.request.context as Record<string, string>;

    const meta = item?.request.metadata as { sha256: string };
    const payload: SigningPayloadInput = {
      v: 1,
      sha256: meta.sha256,
      exif_hash: ctxObj['exif_hash'] as string,
      captured_at_ms: 1_700_000_000_000,
      device_monotonic_ms: 0,
      gps: fixToSigningGps(GOOD_FIX),
      project_id: PROJECT,
      observation_type: 'planting',
      phase: 'before',
      caption: 'Planted 50 saplings',
    };
    expect(
      verifyLocalCapture(payload, {
        signature: ctxObj['capture_signature'] as string,
        devicePublicKey: ctxObj['device_public_key'] as string,
      }),
    ).toBe(true);

    // Editing the caption after signing invalidates verification (§3.4).
    expect(
      verifyLocalCapture(
        { ...payload, caption: 'tampered' },
        {
          signature: ctxObj['capture_signature'] as string,
          devicePublicKey: ctxObj['device_public_key'] as string,
        },
      ),
    ).toBe(false);
  });

  it('honestly records signature_tier server on the fallback path', async () => {
    const { ctx, queue } = makeContext(new NodeEd25519Signer('server'));
    const result = await performCapture(ctx, baseInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = queue.get(result.item.id);
    expect(item?.request.context['signature_tier']).toBe('server');
  });

  it('refuses a capture blocked by GPS accuracy, with a persisted reason', async () => {
    const { ctx, queue } = makeContext();
    const result = await performCapture(ctx, {
      ...baseInput,
      gpsFix: { ...GOOD_FIX, accuracy_m: 500 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/block threshold/);
    expect(queue.list()).toHaveLength(0); // nothing enqueued
  });
});
