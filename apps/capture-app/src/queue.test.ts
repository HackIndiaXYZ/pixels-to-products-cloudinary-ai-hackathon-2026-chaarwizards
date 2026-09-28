import { describe, expect, it } from 'vitest';
import { CaptureQueue, IllegalTransitionError } from './queue.js';
import type { UploadRequest } from './ports.js';
import { InMemoryKeyValueStore, deterministicQueueDeps } from './testing/fakes.js';

const request = (n: number): UploadRequest => ({
  fileUri: `file://capture-${n}.jpg`,
  publicId: `org/project/${'a'.repeat(64)}`,
  context: { project_id: 'p', phase: 'before' },
  metadata: { sha256: 'a'.repeat(64), exif: {} },
});

describe('CaptureQueue state machine', () => {
  it('enqueues items in the queued state', () => {
    const q = new CaptureQueue(new InMemoryKeyValueStore(), deterministicQueueDeps());
    const item = q.enqueue(request(1));
    expect(item.state).toBe('queued');
    expect(item.attempts).toBe(0);
    expect(item.uploadStartedAt).toBeNull();
  });

  it('stamps uploadStartedAt before the attempt and bumps attempts', () => {
    const q = new CaptureQueue(new InMemoryKeyValueStore(), deterministicQueueDeps());
    const { id } = q.enqueue(request(1));
    const syncing = q.markSyncing(id);
    expect(syncing.state).toBe('syncing');
    expect(syncing.attempts).toBe(1);
    expect(syncing.uploadStartedAt).not.toBeNull();
  });

  it('confirms only from syncing', () => {
    const q = new CaptureQueue(new InMemoryKeyValueStore(), deterministicQueueDeps());
    const { id } = q.enqueue(request(1));
    expect(() => q.markConfirmed(id)).toThrow(IllegalTransitionError);
    q.markSyncing(id);
    expect(q.markConfirmed(id).state).toBe('confirmed');
  });

  it('treats confirmed as terminal', () => {
    const q = new CaptureQueue(new InMemoryKeyValueStore(), deterministicQueueDeps());
    const { id } = q.enqueue(request(1));
    q.markSyncing(id);
    q.markConfirmed(id);
    expect(() => q.markSyncing(id)).toThrow(IllegalTransitionError);
  });

  it('records a rejection reason and treats rejected as terminal', () => {
    const q = new CaptureQueue(new InMemoryKeyValueStore(), deterministicQueueDeps());
    const { id } = q.enqueue(request(1));
    q.markSyncing(id);
    const rejected = q.markRejected(id, 'signature_invalid');
    expect(rejected.state).toBe('rejected');
    expect(rejected.rejectionReason).toBe('signature_invalid');
    expect(() => q.markSyncing(id)).toThrow(IllegalTransitionError);
  });

  it('never hands a rejected item back out via nextPending', () => {
    const q = new CaptureQueue(new InMemoryKeyValueStore(), deterministicQueueDeps());
    const { id } = q.enqueue(request(1));
    q.markSyncing(id);
    q.markRejected(id, 'exif_hash_mismatch');
    expect(q.nextPending()).toBeUndefined();
  });

  it('returns an interrupted item to queued (resumable), not confirmed', () => {
    const q = new CaptureQueue(new InMemoryKeyValueStore(), deterministicQueueDeps());
    const { id } = q.enqueue(request(1));
    q.markSyncing(id);
    const back = q.markInterrupted(id);
    expect(back.state).toBe('queued');
    expect(q.nextPending()?.id).toBe(id);
  });
});

describe('CaptureQueue persistence', () => {
  it('survives a restart by reading the same store', () => {
    const store = new InMemoryKeyValueStore();
    const q1 = new CaptureQueue(store, deterministicQueueDeps());
    const a = q1.enqueue(request(1));
    q1.enqueue(request(2));
    q1.markSyncing(a.id);

    // Simulate app kill + relaunch: brand-new queue over the same MMKV store.
    const q2 = new CaptureQueue(store, deterministicQueueDeps());
    expect(q2.list()).toHaveLength(2);
    expect(q2.get(a.id)?.state).toBe('syncing');
    expect(q2.counts()).toEqual({ queued: 1, syncing: 1, confirmed: 0, rejected: 0 });
  });
});
