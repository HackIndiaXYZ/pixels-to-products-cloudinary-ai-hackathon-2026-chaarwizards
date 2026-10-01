/**
 * In-memory port fakes for driving the capture pipeline in tests. These mirror
 * the real native adapters' contracts (MMKV store, NetInfo, Keystore signer,
 * chunked file reader, EXIF reader, Cloudinary uploader) without a device, the
 * same way the API is tested against in-memory port fakes (Phase 3).
 */
import {
  generateKeyPairSync,
  sign as edSign,
  type KeyObject,
} from 'node:crypto';
import type { SignatureTier } from '@panchnama/shared/rn';
import type {
  CaptureSigner,
  Clock,
  ExifReader,
  FileChunkReader,
  NetworkMonitor,
  RawExif,
  SecureKeyValueStore,
  UploadOutcome,
  UploadRequest,
  Uploader,
} from '../ports.js';
import type { QueueDeps } from '../queue.js';

/** MMKV stand-in: a plain Map. Values persist for the store's lifetime, so a new
 *  {@link CaptureQueue} built over the *same* store sees prior items (restart). */
export class InMemoryKeyValueStore implements SecureKeyValueStore {
  private readonly map = new Map<string, string>();

  getString(key: string): string | undefined {
    return this.map.get(key);
  }
  set(key: string, value: string): void {
    this.map.set(key, value);
  }
  delete(key: string): void {
    this.map.delete(key);
  }
  getAllKeys(): readonly string[] {
    return [...this.map.keys()];
  }
}

export class FakeNetworkMonitor implements NetworkMonitor {
  constructor(public connected: boolean) {}
  isConnected(): Promise<boolean> {
    return Promise.resolve(this.connected);
  }
}

/** Deterministic clock. `now` advances by `stepMs` per read; monotonic mirrors it. */
export class FakeClock implements Clock {
  private wall: number;
  private mono: number;
  constructor(startMs = 1_700_000_000_000, private readonly stepMs = 0) {
    this.wall = startMs;
    this.mono = 0;
  }
  now(): number {
    const v = this.wall;
    this.wall += this.stepMs;
    return v;
  }
  monotonicMs(): number {
    const v = this.mono;
    this.mono += this.stepMs;
    return v;
  }
}

/**
 * Ed25519 signer backed by `node:crypto`, used as the test double for both the
 * hardware Keystore signer (`tier: 'device'`) and the software fallback
 * (`tier: 'server'`). The `signature_tier` is whatever it is constructed with —
 * the code under test must not relabel it.
 */
export class NodeEd25519Signer implements CaptureSigner {
  readonly signatureTier: SignatureTier;
  private readonly privateKey: KeyObject;
  private readonly rawPublicKeyBase64: string;

  constructor(tier: SignatureTier) {
    this.signatureTier = tier;
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    this.privateKey = privateKey;
    const jwk = publicKey.export({ format: 'jwk' });
    // jwk.x is base64url of the raw 32-byte public key; re-encode as base64.
    const x = jwk.x ?? '';
    this.rawPublicKeyBase64 = Buffer.from(x, 'base64url').toString('base64');
  }

  publicKeyBase64(): Promise<string> {
    return Promise.resolve(this.rawPublicKeyBase64);
  }

  sign(message: Uint8Array): Promise<string> {
    const sig = edSign(null, Buffer.from(message), this.privateKey);
    return Promise.resolve(sig.toString('base64'));
  }
}

/** EXIF reader that returns a fixed raw object. */
export class StaticExifReader implements ExifReader {
  constructor(private readonly exif: RawExif) {}
  read(): Promise<RawExif> {
    return Promise.resolve(this.exif);
  }
}

/** Chunked reader over an in-memory buffer. */
export class BufferChunkReader implements FileChunkReader {
  constructor(private readonly bytes: Uint8Array) {}
  byteLength(): Promise<number> {
    return Promise.resolve(this.bytes.byteLength);
  }
  async *readChunks(_uri: string, chunkSize: number): AsyncIterable<Uint8Array> {
    for (let offset = 0; offset < this.bytes.byteLength; offset += chunkSize) {
      yield this.bytes.subarray(offset, Math.min(offset + chunkSize, this.bytes.byteLength));
    }
  }
}

/**
 * Reader that *synthesizes* a file of `totalBytes` lazily, never allocating more
 * than one chunk, and records the largest single buffer it ever produced. Lets a
 * test assert that hashing a 200 MB file keeps peak allocation bounded to one
 * chunk — the "streamed" claim.
 */
export class SyntheticChunkReader implements FileChunkReader {
  peakChunkBytes = 0;
  constructor(
    private readonly totalBytes: number,
    private readonly fillByte = 0xab,
  ) {}
  byteLength(): Promise<number> {
    return Promise.resolve(this.totalBytes);
  }
  async *readChunks(_uri: string, chunkSize: number): AsyncIterable<Uint8Array> {
    let remaining = this.totalBytes;
    while (remaining > 0) {
      const size = Math.min(chunkSize, remaining);
      const chunk = new Uint8Array(size).fill(this.fillByte);
      this.peakChunkBytes = Math.max(this.peakChunkBytes, chunk.byteLength);
      yield chunk;
      remaining -= size;
    }
  }
}

/** Uploader that replays a scripted sequence of outcomes and records requests. */
export class ScriptedUploader implements Uploader {
  readonly seen: UploadRequest[] = [];
  private readonly script: UploadOutcome[];
  constructor(script: UploadOutcome[]) {
    this.script = [...script];
  }
  upload(item: UploadRequest): Promise<UploadOutcome> {
    this.seen.push(item);
    const next = this.script.shift();
    if (!next) throw new Error('ScriptedUploader ran out of scripted outcomes');
    return Promise.resolve(next);
  }
}

/** Uploader that throws to simulate a mid-upload network interruption. */
export class ThrowingUploader implements Uploader {
  callCount = 0;
  upload(): Promise<UploadOutcome> {
    this.callCount += 1;
    return Promise.reject(new Error('connection reset mid-upload'));
  }
}

/** Deterministic queue deps: monotonic ids and a fixed-step clock string. */
export function deterministicQueueDeps(startMs = 1_700_000_000_000): QueueDeps {
  let seq = 0;
  let t = startMs;
  return {
    now(): string {
      const iso = new Date(t).toISOString();
      t += 1000;
      return iso;
    },
    newId(): string {
      seq += 1;
      return `item-${seq}`;
    },
  };
}
