/**
 * Native runtime assembly (Phase). Wires every injectable port to
 * its real Expo / React-Native adapter and constructs the offline queue, exactly
 * mirroring how the unit tests wire the in-memory fakes. Screens depend on this
 * runtime, never on a native module directly, so the capture logic stays the
 * single tested implementation.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { CaptureQueue } from '../queue.js';
import { resolveSigner } from '../signing.js';
import { CapturedExifReader } from './exif.js';
import { CloudinaryUploader } from './uploader.js';
import { DeviceClock } from './clock.js';
import { ExpoFileChunkReader } from './fileSystem.js';
import { ExpoLocationProvider } from './location.js';
import { MmkvStore } from './store.js';
import { NetInfoMonitor } from './network.js';
import { SecureStoreSigner, resolveKeystoreSigner } from './signer.js';
import { createNativeHasher } from './hasher.js';
import type { CaptureSigner } from '../ports.js';

const MMKV_KEY_NAME = 'impact.capture.mmkv.key.v1';

async function getMmkvEncryptionKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(MMKV_KEY_NAME);
  if (existing !== null) return existing;
  const key = Crypto.randomUUID();
  await SecureStore.setItemAsync(MMKV_KEY_NAME, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

export interface CaptureRuntime {
  readonly exifReader: CapturedExifReader;
  readonly fileReader: ExpoFileChunkReader;
  readonly hasherFactory: typeof createNativeHasher;
  readonly signer: CaptureSigner;
  readonly clock: DeviceClock;
  readonly location: ExpoLocationProvider;
  readonly network: NetInfoMonitor;
  readonly uploader: CloudinaryUploader;
  readonly queue: CaptureQueue;
}

function requireEnv(value: string | undefined, name: string): string {
  if (value === undefined || value === '') {
    throw new Error(`missing required env ${name}`);
  }
  return value;
}

/** Build the fully-wired native capture runtime. Called once at app start. */
export async function createCaptureRuntime(): Promise<CaptureRuntime> {
  const encryptionKey = await getMmkvEncryptionKey();
  const store = new MmkvStore(encryptionKey);
  const clock = new DeviceClock();

  const queue = new CaptureQueue(store, {
    now: () => new Date(clock.now()).toISOString(),
    newId: () => Crypto.randomUUID(),
  });

  // Honest tier resolution (§8): hardware Keystore signer if available, else the
  // software 'server'-tier fallback. Never relabelled.
  const signer = resolveSigner(resolveKeystoreSigner(), new SecureStoreSigner());

  return {
    exifReader: new CapturedExifReader(),
    fileReader: new ExpoFileChunkReader(),
    hasherFactory: createNativeHasher,
    signer,
    clock,
    location: new ExpoLocationProvider(),
    network: new NetInfoMonitor(),
    uploader: new CloudinaryUploader({
      cloudName: requireEnv(process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME, 'EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME'),
      uploadPreset: requireEnv(process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET, 'EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET'),
    }),
    queue,
  };
}
