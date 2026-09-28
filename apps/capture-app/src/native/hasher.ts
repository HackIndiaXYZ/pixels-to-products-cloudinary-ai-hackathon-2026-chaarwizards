/**
 * Native adapter: streaming SHA-256 via `@noble/hashes` (BUILD_ORDER Phase 4
 * "Hashing"). React Native has no `node:crypto`, so the on-device hasher is a
 * pure-JS incremental SHA-256. It is fed bounded chunks by {@link ExpoFileChunkReader}
 * so the whole file is never resident in memory — the "streamed" claim the gate
 * asserts. The unit-tested default (`createDefaultHasher`) uses the identical
 * `@noble/hashes` algorithm, so device and server digests match byte-for-byte.
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

import type { HasherFactory, StreamingHasher } from '../ports.js';

class NobleStreamingHasher implements StreamingHasher {
  private readonly hash = sha256.create();

  update(chunk: Uint8Array): void {
    this.hash.update(chunk);
  }

  digestHex(): string {
    return bytesToHex(this.hash.digest());
  }
}

/** Factory for a fresh incremental SHA-256, one per file. */
export const createNativeHasher: HasherFactory = () => new NobleStreamingHasher();
