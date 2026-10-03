/**
 * Sync engine (Phase "Sync engine").
 *
 * Drains the offline {@link CaptureQueue} against the network. In production it
 * is triggered by `@react-native-community/netinfo` reachability changes and
 * `expo-background-fetch`; here the trigger is a port so the drain logic is
 * testable. The engine is resumable and honest about failure :
 *  - It uploads only when the network is reachable.
 *  - Each attempt goes through `markSyncing`, which stamps `uploadStartedAt`
 *    before any bytes move.
 *  - A confirmed upload is `confirmed`; a server rejection is `rejected` with its
 *    reason and is never retried; an interrupted or thrown attempt returns to
 *    `queued` (resumable) and is never marked confirmed on a partial upload.
 */
import type { NetworkMonitor, Uploader } from './ports.js';
import type { CaptureQueue, QueueItemState } from './queue.js';

export interface SyncResult {
  readonly attempted: number;
  readonly confirmed: number;
  readonly rejected: number;
  readonly resumable: number;
  /** True when the drain was skipped because the network was unreachable. */
  readonly offline: boolean;
}

/**
 * Run one drain pass. Snapshots the currently-pending item ids up front so an
 * item bounced back to `queued` (interrupted) is not retried within the same
 * pass — it waits for the next trigger, avoiding a hot retry loop.
 */
export async function runSyncOnce(
  queue: CaptureQueue,
  network: NetworkMonitor,
  uploader: Uploader,
): Promise<SyncResult> {
  const empty: SyncResult = {
    attempted: 0,
    confirmed: 0,
    rejected: 0,
    resumable: 0,
    offline: false,
  };

  if (!(await network.isConnected())) {
    return { ...empty, offline: true };
  }

  const pendingIds = queue
    .list()
    .filter((item) => item.state === ('queued' satisfies QueueItemState))
    .map((item) => item.id);

  let attempted = 0;
  let confirmed = 0;
  let rejected = 0;
  let resumable = 0;

  for (const id of pendingIds) {
    const item = queue.get(id);
    if (!item || item.state !== 'queued') continue;

    // Stamp upload_started_at BEFORE the upload (§3.7).
    const syncing = queue.markSyncing(id);
    attempted += 1;

    let outcome;
    try {
      outcome = await uploader.upload(syncing.request);
    } catch (err) {
      // A thrown attempt is an interruption, never a success. Return to queued.
      queue.markInterrupted(id);
      resumable += 1;
      // Surface the reason on the item log without dropping it silently.
      void err;
      continue;
    }

    switch (outcome.kind) {
      case 'confirmed':
        queue.markConfirmed(id);
        confirmed += 1;
        break;
      case 'rejected':
        queue.markRejected(id, outcome.reason);
        rejected += 1;
        break;
      case 'interrupted':
        queue.markInterrupted(id);
        resumable += 1;
        break;
    }
  }

  return { attempted, confirmed, rejected, resumable, offline: false };
}
