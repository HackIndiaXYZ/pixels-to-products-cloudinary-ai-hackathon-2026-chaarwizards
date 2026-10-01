/**
 * Platform ports for the capture app (mirrors the API's injectable-ports
 * pattern, AGENTS.md §4). Every module here depends on these interfaces, never
 * on a concrete Expo/React-Native module, so the whole capture pipeline —
 * EXIF freeze, streamed hashing, Ed25519 signing, the MMKV queue, and the sync
 * engine — is driven in tests with in-memory fakes and in production with the
 * real native modules (`expo-camera`, `expo-location`, `react-native-mmkv`,
 * `@react-native-community/netinfo`, `expo-background-fetch`).
 *
 * The on-device wiring of each port to its native module is a device test and is
 * deferred to user review (BUILD_ORDER Phase 4 "Deferred to user review"); the
 * logic behind each port is what this phase implements and tests.
 */
import type { GpsProvider, SignatureTier } from '@panchnama/shared/rn';

/**
 * Streamed, chunked reader over a file's bytes. `readChunks` MUST yield the file
 * in bounded slices and never materialize the whole file in memory — that is the
 * "streamed" claim the hashing gate asserts (BUILD_ORDER Phase 4). The native
 * adapter is a chunked `expo-file-system` read or a native hashing module.
 */
export interface FileChunkReader {
  /** Total byte length of the file at `uri`. */
  byteLength(uri: string): Promise<number>;
  /** Yield the file's bytes in slices no larger than `chunkSize`. */
  readChunks(uri: string, chunkSize: number): AsyncIterable<Uint8Array>;
}

/**
 * Incremental SHA-256. Kept as a port because React Native has no `node:crypto`;
 * the native adapter wraps a streaming hash (e.g. a Rust/JSI module), while tests
 * and the server-parity default use Node's `createHash`.
 */
export interface StreamingHasher {
  update(chunk: Uint8Array): void;
  /** Lowercase-hex digest. */
  digestHex(): string;
}

/** Factory for a fresh {@link StreamingHasher} per file. */
export type HasherFactory = () => StreamingHasher;

/** Raw EXIF as read off a captured file, before freezing (AGENTS.md §3.1). */
export type RawExif = Record<string, unknown>;

/** Reads raw EXIF from a captured image. Native adapter: `expo-camera` / EXIF lib. */
export interface ExifReader {
  read(uri: string): Promise<RawExif>;
}

/**
 * A capture signer. The device path is an Ed25519 key wrapped by the platform
 * Keystore / Secure Enclave and reports `signatureTier: 'device'`. When that
 * hardware path is unavailable the honest fallback reports `'server'` — it is a
 * `FAIL`, per AGENTS.md §8, to report `'device'` for a non-hardware key.
 */
export interface CaptureSigner {
  readonly signatureTier: SignatureTier;
  /** Base64 raw (32-byte) Ed25519 public key sent in the upload context. */
  publicKeyBase64(): Promise<string>;
  /** Base64 Ed25519 signature over `message`. */
  sign(message: Uint8Array): Promise<string>;
}

/**
 * MMKV-style synchronous key/value store, encrypted at rest. Backs the offline
 * queue; the native adapter is `react-native-mmkv` with an encryption key held
 * in the Keystore. Synchronous by contract so a queue write cannot be lost to an
 * unawaited promise on app kill.
 */
export interface SecureKeyValueStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  getAllKeys(): readonly string[];
}

/** Network reachability. Native adapter: `@react-native-community/netinfo`. */
export interface NetworkMonitor {
  isConnected(): Promise<boolean>;
}

/** Wall-clock and monotonic clocks (AGENTS.md §3.7 — skew vs dwell). */
export interface Clock {
  /** Wall-clock epoch milliseconds. */
  now(): number;
  /** Monotonic milliseconds, immune to wall-clock adjustment. */
  monotonicMs(): number;
}

/** A single GPS fix as captured by `expo-location`. */
export interface GpsFix {
  readonly lat: number;
  readonly lon: number;
  readonly accuracy_m: number;
  readonly altitude_m?: number;
  readonly provider: GpsProvider;
}

/** Reads a GPS fix. Native adapter: `expo-location` `BestForNavigation`. */
export interface LocationProvider {
  currentFix(): Promise<GpsFix>;
}

/** Outcome of a single upload attempt against the Cloudinary direct-upload URL. */
export type UploadOutcome =
  | { readonly kind: 'confirmed'; readonly cloudinaryPublicId: string }
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'interrupted'; readonly reason: string };

/** Uploads one queued item's bytes + signed context to Cloudinary. */
export interface Uploader {
  upload(item: UploadRequest): Promise<UploadOutcome>;
}

/** The immutable, signed payload an {@link Uploader} transmits. */
export interface UploadRequest {
  readonly fileUri: string;
  readonly publicId: string;
  readonly context: Readonly<Record<string, string>>;
  readonly metadata: Readonly<Record<string, unknown>>;
}
