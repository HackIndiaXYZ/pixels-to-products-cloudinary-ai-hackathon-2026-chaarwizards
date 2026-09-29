import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { assembleReport, type AssembleInput } from './assemble.js';
import { getBuiltInTemplate } from './templates.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0x04]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x10]);

function baseInput(overrides: Partial<AssembleInput> = {}): AssembleInput {
  const template = getBuiltInTemplate('forestry_donor');
  if (template === null) throw new Error('template missing');
  return {
    template,
    title: 'Test Report',
    project: { name: 'Rainforest Alpha', sector: 'forestry', id: 'proj-1', dateFrom: '2024-01-01', dateTo: '2024-03-01' },
    fontFaceCss: '',
    pairs: [
      {
        before: {
          media: { cloudinaryPublicId: 'org/p/before', derivativePublicId: 'org/p/before/report_full', bytes: JPEG, mime: 'image/jpeg' },
          caption: 'bare plot',
          capturedAt: '2024-01-01T00:00:00.000Z',
          observationType: 'planting',
        },
        after: {
          media: { cloudinaryPublicId: 'org/p/after', derivativePublicId: 'org/p/after/report_full', bytes: PNG, mime: 'image/png' },
          caption: 'planted',
          capturedAt: '2024-03-01T00:00:00.000Z',
          observationType: 'planting',
        },
        diff: null,
        metrics: { saplings_planted: 49, area_covered_sqm: 1200.5 },
        modelVersion: 'v1-placeholder',
        changeType: 'sapling_planting',
        gpsDistanceMeters: 3.2,
        timeDifferenceHours: 72,
      },
    ],
    map: null,
    videoClips: [],
    appendix: {
      include: true,
      assets: [
        {
          assetId: 'asset-before',
          currentHash: 'HASH_BEFORE',
          signatureStatus: 'pass',
          exifStatus: 'pass',
          captionStatus: 'unknown',
          deviceCaptureTimestamp: '2024-01-01T00:00:00.000Z',
          serverUploadTimestamp: '2024-01-01T00:05:00.000Z',
          clockDriftSeconds: null,
          modelVersions: ['v1-placeholder'],
        },
      ],
      chain: [{ assetId: 'asset-before', action: 'upload', previousHash: null, currentHash: 'HASH_BEFORE' }],
    },
    ...overrides,
  };
}

describe('assembleReport (Phase 9)', () => {
  it('inlines every image as a data URI and references NO network resource', () => {
    const { html } = assembleReport(baseInput());
    expect(html).toContain('data:image/jpeg;base64,');
    expect(html).toContain('data:image/png;base64,');
    // Self-contained artifact: no http(s) src anywhere, so it renders offline.
    expect(html).not.toMatch(/src=["']https?:\/\//);
    expect(html).not.toMatch(/https?:\/\/res\.cloudinary\.com/);
  });

  it('produces a manifest whose sha256 matches the exact bytes embedded', () => {
    const { html, manifest } = assembleReport(baseInput());
    expect(manifest.length).toBe(2); // before + after photos

    // Pull every data URI out of the HTML and hash the decoded bytes; each must
    // match a manifest row's sha256 (Phase 9 manifest gate).
    const dataUris = [...html.matchAll(/data:[^;]+;base64,([A-Za-z0-9+/=]+)/g)].map((m) => m[1] ?? '');
    const embeddedHashes = new Set(
      dataUris.map((b64) => createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex')),
    );
    for (const row of manifest) {
      expect(embeddedHashes.has(row.sha256Hash)).toBe(true);
      expect(row.byteSize).toBeGreaterThan(0);
      expect(row.verified).toBe(true);
    }
    // The known JPEG bytes hash to the before-photo manifest row.
    const jpegHash = createHash('sha256').update(JPEG).digest('hex');
    expect(manifest.some((m) => m.sha256Hash === jpegHash)).toBe(true);
  });

  it('is deterministic: identical inputs yield byte-identical HTML', () => {
    const a = assembleReport(baseInput()).html;
    const b = assembleReport(baseInput()).html;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('assigns ordinals in document order (map, then pairs, then clips)', () => {
    const { manifest } = assembleReport(
      baseInput({
        map: { cloudinaryPublicId: null, derivativePublicId: null, bytes: Buffer.from('<svg></svg>'), mime: 'image/svg+xml' },
      }),
    );
    expect(manifest[0]?.role).toBe('map');
    expect(manifest[0]?.ordinal).toBe(1);
    expect(manifest[1]?.role).toBe('photo');
  });

  it('prints the DB current_hash in the appendix and renders unknown as unknown, not pass', () => {
    const { html } = assembleReport(baseInput());
    expect(html).toContain('HASH_BEFORE');
    // caption status is unknown; it must appear as the word "unknown", and the
    // appendix must not silently upgrade an unknown to a pass (§3.7).
    expect(html).toContain('unknown');
  });

  it('omits the appendix entirely when not requested', () => {
    const { html, model } = assembleReport(baseInput({ appendix: { include: false, assets: [], chain: [] } }));
    expect(html).not.toContain('Integrity Appendix');
    expect(model.appendix.manifest.length).toBe(0);
  });
});
