import { describe, expect, it } from 'vitest';
import { CaptureQueue } from './queue.js';
import { runSyncOnce } from './sync.js';
import type { UploadRequest } from './ports.js';
import {
  FakeNetworkMonitor,
  InMemoryKeyValueStore,
  ScriptedUploader,
  ThrowingUploader,
  deterministicQueueDeps,
} from './testing/fakes.js';

const request = (n: number): UploadRequest => ({
  fileUri: `file://capture-${n}.jpg`,
  publicId: `org/project/${'a'.repeat(64)}`,
  context: {},
  metadata: {},
});

const newQueue = (): CaptureQueue =>
  new CaptureQueue(new InMemoryKeyValueStore(), deterministicQueueDeps());

describe('runSyncOnce', () => {
  it('skips the drain and reports offline when unreachable', async () => {
    const q = newQueue();
    q.enqueue(request(1));
    const uploader = new ScriptedUploader([]);
    const result = await runSyncOnce(q, new FakeNetworkMonitor(false), uploader);
    expect(result.offline).toBe(true);
    expect(result.attempted).toBe(0);
    expect(uploader.seen).toHaveLength(0);
    expect(q.nextPending()).toBeDefined();
  });

  it('confirms a successful upload', async () => {
    const q = newQueue();
    const { id } = q.enqueue(request(1));
    const uploader = new ScriptedUploader([
      { kind: 'confirmed', cloudinaryPublicId: 'org/project/x' },
    ]);
    const result = await runSyncOnce(q, new FakeNetworkMonitor(true), uploader);
    expect(result.confirmed).toBe(1);
    expect(q.get(id)?.state).toBe('confirmed');
  });

  it('rejects and never re-attempts a rejected item on a later pass', async () => {
    const q = newQueue();
    const { id } = q.enqueue(request(1));
    const uploader = new ScriptedUploader([{ kind: 'rejected', reason: 'exif_hash_mismatch' }]);
    const net = new FakeNetworkMonitor(true);

    const first = await runSyncOnce(q, net, uploader);
    expect(first.rejected).toBe(1);
    expect(q.get(id)?.state).toBe('rejected');
    expect(q.get(id)?.rejectionReason).toBe('exif_hash_mismatch');

    // Second pass: the rejected item must NOT be uploaded again (no infinite retry).
    const second = await runSyncOnce(q, net, uploader);
    expect(second.attempted).toBe(0);
    expect(uploader.seen).toHaveLength(1);
  });

  it('leaves an interrupted item resumable and never confirmed', async () => {
    const q = newQueue();
    const { id } = q.enqueue(request(1));
    const uploader = new ScriptedUploader([{ kind: 'interrupted', reason: 'timeout' }]);
    const result = await runSyncOnce(q, new FakeNetworkMonitor(true), uploader);
    expect(result.resumable).toBe(1);
    const item = q.get(id);
    expect(item?.state).toBe('queued');
    expect(item?.uploadStartedAt).not.toBeNull(); // stamped before the attempt
  });

  it('treats a thrown upload as an interruption, not a success', async () => {
    const q = newQueue();
    const { id } = q.enqueue(request(1));
    const uploader = new ThrowingUploader();
    const result = await runSyncOnce(q, new FakeNetworkMonitor(true), uploader);
    expect(result.resumable).toBe(1);
    expect(uploader.callCount).toBe(1);
    expect(q.get(id)?.state).toBe('queued');
  });

  it('does not retry an item bounced back to queued within the same pass', async () => {
    const q = newQueue();
    q.enqueue(request(1));
    const uploader = new ScriptedUploader([{ kind: 'interrupted', reason: 'timeout' }]);
    const result = await runSyncOnce(q, new FakeNetworkMonitor(true), uploader);
    // Exactly one attempt this pass, even though the item is queued again after.
    expect(result.attempted).toBe(1);
    expect(uploader.seen).toHaveLength(1);
  });
});
