/**
 * Live Puppeteer render check (Phase 9 gate item #4 + determinism).
 *
 * Unlike renderer.test.ts / assemble.test.ts which assert on the artifact bytes,
 * this test launches a real Chromium, prints the assembled self-contained HTML to
 * PDF with the network disabled, and verifies:
 *   - a valid PDF comes back (offline render succeeds, all images inline),
 *   - identical HTML yields byte-identical PDFs after timestamp normalization.
 *
 * It is skipped automatically when no Chromium binary is installed, so CI without
 * a browser stays green; run `npx puppeteer browsers install chrome` to enable it.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createPuppeteerRenderer } from './renderer.js';
import { assembleReport, type AssembleInput } from './assemble.js';
import { getBuiltInTemplate } from './templates.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0x04]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x10]);

function hasChromium(): boolean {
  const base = join(process.env.HOME ?? '', '.cache', 'puppeteer', 'chrome');
  return existsSync(base);
}

function baseInput(): AssembleInput {
  const template = getBuiltInTemplate('forestry_donor');
  if (template === null) throw new Error('template missing');
  return {
    template,
    title: 'Live Render Report',
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
  };
}

describe.skipIf(!hasChromium())('live Puppeteer render (Phase 9 gate #4)', () => {
  const fontsDir = join(import.meta.dirname, 'fonts');
  const renderer = createPuppeteerRenderer(fontsDir);

  it('renders the self-contained HTML to a valid PDF with the network disabled', async () => {
    const { html } = assembleReport(baseInput());
    const pdf = await renderer.htmlToPdf(html);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }, 60_000);

  it('is deterministic: identical HTML yields byte-identical PDFs', async () => {
    const { html } = assembleReport(baseInput());
    const a = await renderer.htmlToPdf(html);
    const b = await renderer.htmlToPdf(html);
    expect(a.equals(b)).toBe(true);
  }, 60_000);
});
