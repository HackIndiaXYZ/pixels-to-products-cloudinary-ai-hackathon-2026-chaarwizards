/**
 * Native adapter: chunked file reader over `expo-file-system` (architecture specification
 * Phase 4 "Hashing"). Reads a file in bounded byte slices and yields them, so a
 * 200 MB video is hashed without ever materialising the whole file in JS memory.
 *
 * `expo-file-system` exposes only base64 reads with a `position`/`length`
 * window, so each slice is read at an offset and decoded to bytes. The window is
 * the caller's `chunkSize`; peak memory is one chunk plus its base64 form, never
 * the file.
 */
import * as FileSystem from 'expo-file-system';

import type { FileChunkReader } from '../ports.js';

function base64ToBytes(b64: string): Uint8Array {
  // React Native ships `global.atob`; fall back to Buffer under Node tooling.
  const binary =
    typeof atob === 'function'
      ? atob(b64)
      : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export class ExpoFileChunkReader implements FileChunkReader {
  async byteLength(uri: string): Promise<number> {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    if (!info.exists) throw new Error(`file not found: ${uri}`);
    return info.size ?? 0;
  }

  async *readChunks(uri: string, chunkSize: number): AsyncIterable<Uint8Array> {
    if (chunkSize <= 0) throw new Error('chunkSize must be positive');
    const total = await this.byteLength(uri);
    for (let position = 0; position < total; position += chunkSize) {
      const length = Math.min(chunkSize, total - position);
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
        position,
        length,
      });
      yield base64ToBytes(b64);
    }
  }
}
