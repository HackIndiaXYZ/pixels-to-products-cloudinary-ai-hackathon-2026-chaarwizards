/**
 * Native adapter: encrypted key/value store over `react-native-mmkv`
 * (Phase "MMKV queue"). Backs the offline capture queue. MMKV is
 * synchronous by design, matching the {@link SecureKeyValueStore} contract, so a
 * queue write cannot be lost to an unawaited promise if the app is killed
 * mid-capture. The instance is encrypted at rest with a key held in the platform
 * secure store; the queue therefore survives an app restart (a device test).
 */
import { MMKV } from 'react-native-mmkv';

import type { SecureKeyValueStore } from '../ports.js';

export class MmkvStore implements SecureKeyValueStore {
  private readonly mmkv: MMKV;

  constructor(encryptionKey: string, id = 'impact.capture.queue') {
    this.mmkv = new MMKV({ id, encryptionKey });
  }

  getString(key: string): string | undefined {
    return this.mmkv.getString(key);
  }

  set(key: string, value: string): void {
    this.mmkv.set(key, value);
  }

  delete(key: string): void {
    this.mmkv.delete(key);
  }

  getAllKeys(): readonly string[] {
    return this.mmkv.getAllKeys();
  }
}
