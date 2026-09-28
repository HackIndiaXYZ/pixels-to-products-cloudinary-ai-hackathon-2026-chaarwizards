/**
 * Sync triggers (BUILD_ORDER Phase 4 "Sync engine"). Drains the offline queue on
 * two events: a `@react-native-community/netinfo` transition to online, and an
 * `expo-background-fetch` wake-up. Both call the same tested {@link runSyncOnce}
 * drain, which is resumable and never marks a partial upload confirmed (§3.7).
 */
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import NetInfo from '@react-native-community/netinfo';

import { runSyncOnce } from '../sync.js';
import type { CaptureRuntime } from './runtime.js';

export const SYNC_TASK = 'impact.capture.sync';

/**
 * Register the background-fetch task and a net-reachability listener. Returns an
 * unsubscribe for the listener. The runtime is captured by reference so the task
 * and listener always drain the live queue.
 */
export async function registerSyncTriggers(runtime: CaptureRuntime): Promise<() => void> {
  if (!TaskManager.isTaskDefined(SYNC_TASK)) {
    TaskManager.defineTask(SYNC_TASK, async () => {
      const result = await runSyncOnce(runtime.queue, runtime.network, runtime.uploader);
      return result.confirmed > 0
        ? BackgroundFetch.BackgroundFetchResult.NewData
        : BackgroundFetch.BackgroundFetchResult.NoData;
    });
  }

  await BackgroundFetch.registerTaskAsync(SYNC_TASK, {
    minimumInterval: 15 * 60, // seconds; OS treats this as a floor
    stopOnTerminate: false,
    startOnBoot: true,
  });

  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected === true && state.isInternetReachable !== false) {
      void runSyncOnce(runtime.queue, runtime.network, runtime.uploader);
    }
  });

  return unsubscribe;
}
