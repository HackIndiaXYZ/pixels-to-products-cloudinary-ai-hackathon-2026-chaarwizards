/**
 * Report renderer (Phase "Renderer"): HTML → PDF via Puppeteer,
 * plus the Inter font embedding that makes rendering deterministic.
 *
 * Determinism notes (Phase 9 "Determinism"):
 *  - Line-wrapping only matches across machines if the exact same font is
 *    embedded, so {@link loadFontFaceCss} inlines the Inter font bytes as
 *    `@font-face` data URIs. With no font files present the report still renders,
 *    but the phase gate's byte-identical claim then rests on the browser's
 *    default font — which is why the artifact of record for the determinism gate
 *    is the self-contained HTML (identical bytes regardless), and the PDF is the
 *    delivery format.
 *  - Chromium stamps a `/CreationDate` and `/ModDate` into every PDF it prints,
 *    which would differ between two runs. {@link stripPdfTimestamps} rewrites
 *    both to a fixed epoch so the PDF is reproducible from identical HTML.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ReportRenderer {
  /** Render self-contained HTML to a PDF buffer. Never fetches the network. */
  htmlToPdf(html: string): Promise<Buffer>;
}

/** Guess a font weight from a filename so multiple Inter weights register. */
function weightFromFilename(name: string): number {
  const lower = name.toLowerCase();
  if (lower.includes('thin')) return 100;
  if (lower.includes('extralight')) return 200;
  if (lower.includes('light')) return 300;
  if (lower.includes('medium')) return 500;
  if (lower.includes('semibold')) return 600;
  if (lower.includes('extrabold')) return 800;
  if (lower.includes('black')) return 900;
  if (lower.includes('bold')) return 700;
  return 400;
}

/**
 * Build `@font-face` CSS with the Inter font bytes inlined as data URIs, read
 * from `fontsDir`. Returns `''` when the directory is absent or empty — the
 * caller records that the artifact then depends on a system font.
 */
export async function loadFontFaceCss(fontsDir: string): Promise<string> {
  let files: string[];
  try {
    files = (await readdir(fontsDir)).filter((f) => f.toLowerCase().endsWith('.woff2')).sort();
  } catch {
    return '';
  }
  const faces: string[] = [];
  for (const file of files) {
    const bytes = await readFile(join(fontsDir, file));
    const b64 = bytes.toString('base64');
    const weight = weightFromFilename(file);
    faces.push(
      `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};` +
        `font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`,
    );
  }
  return faces.join('\n');
}

/**
 * Rewrite the PDF `/CreationDate` and `/ModDate` to a fixed timestamp so the
 * bytes are reproducible. Chromium writes them in `D:YYYYMMDDHHmmSS` form.
 */
export function stripPdfTimestamps(pdf: Buffer): Buffer {
  const FIXED = 'D:19700101000000Z';
  const text = pdf.toString('latin1').replace(/\/(CreationDate|ModDate)\s*\(D:[^)]*\)/g, (_m, key) => `/${key} (${FIXED})`);
  return Buffer.from(text, 'latin1');
}

/**
 * Puppeteer-backed renderer. The browser is launched offline (no network is
 * needed — every asset is inlined) and its PDF timestamps are normalized.
 *
 * Requires a Chromium binary; where none is available (CI, this sandbox) the
 * launch throws and the caller surfaces it rather than shipping a blank report.
 */
export function createPuppeteerRenderer(fontsDir: string): ReportRenderer {
  return {
    async htmlToPdf(html: string): Promise<Buffer> {
      // Imported lazily so the whole API does not fail to boot on a box with no
      // Chromium; only report generation depends on it.
      const puppeteer = (await import('puppeteer')).default;
      const fontCss = await loadFontFaceCss(fontsDir);
      // If the HTML did not already carry the font (assembled elsewhere), the
      // caller is expected to have injected it; we do not mutate the artifact
      // here so the rendered bytes match the stored HTML.
      void fontCss;
      const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      try {
        const page = await browser.newPage();
        await page.setOfflineMode(true);
        await page.setContent(html, { waitUntil: 'load' });
        const pdf = await page.pdf({ format: 'a4', printBackground: true });
        return stripPdfTimestamps(Buffer.from(pdf));
      } finally {
        await browser.close();
      }
    },
  };
}
