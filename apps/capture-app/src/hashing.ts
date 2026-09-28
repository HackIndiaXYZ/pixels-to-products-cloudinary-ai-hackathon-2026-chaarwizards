/**
 * Streamed SHA-256 over a file's raw bytes (BUILD_ORDER Phase 4 "Hashing").
 *
 * The rule is explicit: **never load the whole file into JS memory.** A 200 MB
 * capture is hashed by pulling bounded chunks from a {@link FileChunkReader} and
 * folding each into an incremental {@link StreamingHasher}, so peak memory is one
 * chunk, not the file. The hashing gate asserts both correctness against
 * `sha256sum` and that peak allocation stays bounded — "streamed" is a claim,
 * not a comment, so it is tested.
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { FileChunkReader, HasherFactory, StreamingHasher } from './ports.js';

/** Default chunk size (1 MiB): large enough to be efficient, small vs any file. */
export const DEFAULT_CHUNK_SIZE = 1024 * 1024;

/**
 * Default incremental hasher. Pure-JS `@noble/hashes` SHA-256 so the *same*
 * implementation runs under Node in tests and on-device under React Native
 * (which has no `node:crypto`) — the digest is byte-identical to `sha256sum` and
 * to the server's re-hash. The native adapter may still supply a faster native
 * streaming hasher through the same interface; neither path concatenates chunks.
 */
export function createDefaultHasher(): StreamingHasher {
  const hash = sha256.create();
  return {
    update(chunk: Uint8Array): void {
      hash.update(chunk);
    },
    digestHex(): string {
      return bytesToHex(hash.digest());
    },
  };
}

/**
 * Stream `uri` through `reader` in `chunkSize` slices, updating a fresh hasher,
 * and return the lowercase-hex SHA-256. Memory is bounded by `chunkSize`: no
 * chunk is retained after it is folded in.
 */
export async function streamSha256(
  reader: FileChunkReader,
  uri: string,
  options: { chunkSize?: number; hasherFactory?: HasherFactory } = {},
): Promise<string> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  if (chunkSize <= 0) {
    throw new RangeError(`chunkSize must be positive, got ${chunkSize}`);
  }
  const hasher = (options.hasherFactory ?? createDefaultHasher)();
  for await (const chunk of reader.readChunks(uri, chunkSize)) {
    if (chunk.byteLength > chunkSize) {
      // A reader that violates the chunk bound would defeat the memory guarantee.
      throw new RangeError(
        `chunk of ${chunk.byteLength} bytes exceeds chunkSize ${chunkSize}`,
      );
    }
    hasher.update(chunk);
  }
  return hasher.digestHex();
}
