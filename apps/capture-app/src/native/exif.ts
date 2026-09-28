/**
 * Native adapter: EXIF reader (BUILD_ORDER Phase 4 "EXIF freeze").
 *
 * `expo-camera` returns the EXIF block on the capture result when
 * `takePictureAsync({ exif: true })` is used. The camera screen stashes that raw
 * block keyed by the photo `uri`; this reader hands it back to the capture
 * pipeline, which then applies the {@link freezeExif} allowlist. Nothing here
 * decides what survives — the allowlist in `exif.ts` is the single authority
 * (AGENTS.md §3.1), and this adapter never mutates the raw block.
 */
import type { ExifReader, RawExif } from '../ports.js';

export class CapturedExifReader implements ExifReader {
  private readonly byUri = new Map<string, RawExif>();

  /** Called by the camera screen with the EXIF block from `takePictureAsync`. */
  remember(uri: string, exif: RawExif | undefined | null): void {
    this.byUri.set(uri, exif ?? {});
  }

  read(uri: string): Promise<RawExif> {
    return Promise.resolve(this.byUri.get(uri) ?? {});
  }
}
