import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { streamSha256 } from './hashing.js';
import { BufferChunkReader, SyntheticChunkReader } from './testing/fakes.js';

const FIXTURE_URL = new URL('../fixtures/known-bytes.txt', import.meta.url);
// Precomputed with `sha256sum fixtures/known-bytes.txt`.
const KNOWN_SHA256 = '22d20e250cd60d580ce3d59eb1356b31c304aefaa6860cefe30fd4e89a9dc122';

describe('streamSha256', () => {
  it('matches sha256sum of a known fixture file', async () => {
    const bytes = new Uint8Array(readFileSync(fileURLToPath(FIXTURE_URL)));
    const reader = new BufferChunkReader(bytes);
    const digest = await streamSha256(reader, 'known-bytes.txt', { chunkSize: 8 });
    expect(digest).toBe(KNOWN_SHA256);
  });

  it('is independent of chunk size', async () => {
    const bytes = new Uint8Array(readFileSync(fileURLToPath(FIXTURE_URL)));
    const big = await streamSha256(new BufferChunkReader(bytes), 'f', { chunkSize: 1024 });
    const tiny = await streamSha256(new BufferChunkReader(bytes), 'f', { chunkSize: 1 });
    expect(big).toBe(tiny);
    expect(big).toBe(KNOWN_SHA256);
  });

  it('hashes a 200 MB file without loading it whole into memory', async () => {
    const totalBytes = 200 * 1024 * 1024;
    const chunkSize = 1024 * 1024;
    const reader = new SyntheticChunkReader(totalBytes, 0xab);

    const digest = await streamSha256(reader, 'huge.bin', { chunkSize });

    // Peak allocation stayed at one chunk, never the whole 200 MB.
    expect(reader.peakChunkBytes).toBeLessThanOrEqual(chunkSize);
    expect(reader.peakChunkBytes).toBeGreaterThan(0);

    // Correctness: equals the digest of the same synthetic content.
    const expected = createHash('sha256');
    const filler = new Uint8Array(chunkSize).fill(0xab);
    let remaining = totalBytes;
    while (remaining > 0) {
      const size = Math.min(chunkSize, remaining);
      expected.update(size === chunkSize ? filler : filler.subarray(0, size));
      remaining -= size;
    }
    expect(digest).toBe(expected.digest('hex'));
  });

  it('rejects a non-positive chunk size', async () => {
    const reader = new BufferChunkReader(new Uint8Array([1, 2, 3]));
    await expect(streamSha256(reader, 'f', { chunkSize: 0 })).rejects.toThrow(RangeError);
  });
});
