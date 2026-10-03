/**
 * Offline capture queue (Phase "MMKV queue" + "Offline UX").
 *
 * Every capture lands here first and is uploaded later, so the app works fully
 * offline. The queue is persisted through a {@link SecureKeyValueStore} (MMKV,
 * encrypted at rest) and therefore survives an app restart. Each item runs a
 * strict state machine:
 *
 *     queued ──markSyncing──▶ syncing ──markConfirmed──▶ confirmed (terminal)
 *        ▲                       │
 *        └────markInterrupted────┘  (resumable: never jumps straight to confirmed)
 *        │                       │
 *        └───────markRejected────┴──▶ rejected (terminal, carries a reason)
 *
 * Two failure-path invariants  are enforced structurally,
 * not by convention:
 *  - A `rejected` item is terminal and is never handed out again, so the sync
 *    engine cannot retry it forever (an infinite retry is a silent failure with a
 *    network bill attached).
 *  - `markSyncing` stamps `uploadStartedAt` *before* the attempt, so an
 *    interrupted upload returns to `queued` (resumable) and can never be recorded
 *    as `confirmed`, and `sync_delay_seconds` stays honest.
 */
import type { SecureKeyValueStore, UploadRequest } from './ports.js';

export type QueueItemState = 'queued' | 'syncing' | 'confirmed' | 'rejected';

export interface QueueItem {
  readonly id: string;
  readonly state: QueueItemState;
  readonly request: UploadRequest;
  /** Number of upload attempts started. */
  readonly attempts: number;
  /** ISO time the most recent attempt began; set *before* the upload (§3.7). */
  readonly uploadStartedAt: string | null;
  /** Reason persisted when the server rejects the item . */
  readonly rejectionReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const INDEX_KEY = 'capture-queue/index';
const itemKey = (id: string): string => `capture-queue/item/${id}`;

/** Allowed state transitions. Any pair not listed is rejected. */
const TRANSITIONS: Record<QueueItemState, ReadonlySet<QueueItemState>> = {
  queued: new Set<QueueItemState>(['syncing', 'rejected']),
  syncing: new Set<QueueItemState>(['confirmed', 'rejected', 'queued']),
  confirmed: new Set<QueueItemState>(),
  rejected: new Set<QueueItemState>(),
};

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: QueueItemState,
    readonly to: QueueItemState,
    readonly itemId: string,
  ) {
    super(`illegal queue transition ${from} → ${to} for item ${itemId}`);
    this.name = 'IllegalTransitionError';
  }
}

/** Deterministic clock + id seams so tests are reproducible. */
export interface QueueDeps {
  now(): string;
  newId(): string;
}

export class CaptureQueue {
  constructor(
    private readonly store: SecureKeyValueStore,
    private readonly deps: QueueDeps,
  ) {}

  private readIndex(): string[] {
    const raw = this.store.getString(INDEX_KEY);
    if (raw === undefined) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  }

  private writeIndex(ids: readonly string[]): void {
    this.store.set(INDEX_KEY, JSON.stringify(ids));
  }

  private readItem(id: string): QueueItem | undefined {
    const raw = this.store.getString(itemKey(id));
    if (raw === undefined) return undefined;
    return JSON.parse(raw) as QueueItem;
  }

  private writeItem(item: QueueItem): void {
    this.store.set(itemKey(item.id), JSON.stringify(item));
  }

  /** All items, in insertion order. Reads straight from the store (restart-safe). */
  list(): readonly QueueItem[] {
    const items: QueueItem[] = [];
    for (const id of this.readIndex()) {
      const item = this.readItem(id);
      if (item) items.push(item);
    }
    return items;
  }

  get(id: string): QueueItem | undefined {
    return this.readItem(id);
  }

  /** Enqueue a signed capture. It starts `queued`. */
  enqueue(request: UploadRequest): QueueItem {
    const id = this.deps.newId();
    const now = this.deps.now();
    const item: QueueItem = {
      id,
      state: 'queued',
      request,
      attempts: 0,
      uploadStartedAt: null,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    };
    this.writeItem(item);
    this.writeIndex([...this.readIndex(), id]);
    return item;
  }

  private transition(id: string, patch: (current: QueueItem) => QueueItem): QueueItem {
    const current = this.readItem(id);
    if (!current) throw new Error(`queue item ${id} not found`);
    const next = patch(current);
    if (next.state !== current.state && !TRANSITIONS[current.state].has(next.state)) {
      throw new IllegalTransitionError(current.state, next.state, id);
    }
    const updated: QueueItem = { ...next, updatedAt: this.deps.now() };
    this.writeItem(updated);
    return updated;
  }

  /**
   * Begin an upload attempt: `queued → syncing`, stamping `uploadStartedAt`
   * *before* any bytes move and bumping `attempts` (§3.7).
   */
  markSyncing(id: string): QueueItem {
    return this.transition(id, (current) => ({
      ...current,
      state: 'syncing',
      attempts: current.attempts + 1,
      uploadStartedAt: this.deps.now(),
    }));
  }

  /** Server confirmed the upload: `syncing → confirmed` (terminal). */
  markConfirmed(id: string): QueueItem {
    return this.transition(id, (current) => ({ ...current, state: 'confirmed' }));
  }

  /**
   * Server rejected the item: `→ rejected` (terminal) with a persisted reason.
   * A rejected item is never handed back out by {@link nextPending}.
   */
  markRejected(id: string, reason: string): QueueItem {
    return this.transition(id, (current) => ({
      ...current,
      state: 'rejected',
      rejectionReason: reason,
    }));
  }

  /**
   * An attempt was interrupted mid-upload: `syncing → queued`. The item stays
   * resumable and is never marked confirmed on a partial upload.
   */
  markInterrupted(id: string): QueueItem {
    return this.transition(id, (current) => ({ ...current, state: 'queued' }));
  }

  /** The next item eligible for an upload attempt, or `undefined`. */
  nextPending(): QueueItem | undefined {
    return this.list().find((item) => item.state === 'queued');
  }

  /** Count items by state, for the Offline UX summary badges. */
  counts(): Record<QueueItemState, number> {
    const tally: Record<QueueItemState, number> = {
      queued: 0,
      syncing: 0,
      confirmed: 0,
      rejected: 0,
    };
    for (const item of this.list()) tally[item.state] += 1;
    return tally;
  }
}
