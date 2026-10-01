import { describe, expect, it } from 'vitest';
import { sha256Canonical } from '@panchnama/shared/rn';
import { EXIF_ALLOWLIST, computeExifHash, freezeExif } from './exif.js';

const RAW_EXIF = {
  Make: 'Apple',
  Model: 'iPhone 15 Pro',
  LensModel: 'iPhone 15 Pro back camera',
  Orientation: 1,
  ColorSpace: 1,
  ImageWidth: 4032,
  ImageHeight: 3024,
  // Editable / mutable tags that must be discarded:
  Software: 'Photoshop 25.0',
  DateTimeOriginal: '2024:01:15 09:30:00',
  GPSLatitude: 19.1234,
  UserComment: 'edited later',
};

describe('freezeExif', () => {
  it('keeps only the allowlisted hardware tags', () => {
    const frozen = freezeExif(RAW_EXIF);
    expect(Object.keys(frozen).sort()).toEqual([...EXIF_ALLOWLIST].sort());
    expect(frozen).not.toHaveProperty('Software');
    expect(frozen).not.toHaveProperty('DateTimeOriginal');
    expect(frozen).not.toHaveProperty('GPSLatitude');
  });

  it('emits keys in allowlist order for a deterministic object', () => {
    const frozen = freezeExif(RAW_EXIF);
    expect(Object.keys(frozen)).toEqual(
      EXIF_ALLOWLIST.filter((k) => k in RAW_EXIF),
    );
  });

  it('omits allowlisted keys that are absent rather than emitting null', () => {
    const frozen = freezeExif({ Make: 'Canon' });
    expect(Object.keys(frozen)).toEqual(['Make']);
  });
});

describe('computeExifHash', () => {
  it('equals the server JCS hash of the frozen EXIF (AGENTS.md §3.8)', () => {
    // The API re-hashes metadata.exif with sha256Canonical; parity is proven by
    // using the same shared function over the same frozen object.
    const frozen = freezeExif(RAW_EXIF);
    expect(computeExifHash(RAW_EXIF)).toBe(sha256Canonical(frozen));
  });

  it('is unchanged by injecting a Software or DateTimeOriginal tag', () => {
    const base = computeExifHash({
      Make: 'Apple',
      Model: 'iPhone 15 Pro',
      Orientation: 1,
    });
    const injected = computeExifHash({
      Make: 'Apple',
      Model: 'iPhone 15 Pro',
      Orientation: 1,
      Software: 'tampered',
      DateTimeOriginal: '2099:01:01 00:00:00',
    });
    expect(injected).toBe(base);
  });
});
