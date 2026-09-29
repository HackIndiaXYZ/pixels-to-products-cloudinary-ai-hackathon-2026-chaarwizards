/**
 * Schematic site-map generator (BUILD_ORDER Phase 9 "Template": map). Produces a
 * self-contained inline SVG rendered at report time, so a finalized report needs
 * no network and no tile provider to show its map panel (Phase 9 "Self-contained
 * artifact").
 *
 * This is a deterministic locator panel, not a geo-referenced basemap: a
 * tile-backed basemap would require pre-fetching third-party map tiles at
 * generation time, which is a follow-up. The output is a pure function of its
 * inputs, so it never breaks the byte-identical determinism contract.
 */
export interface SchematicMapInput {
  readonly projectName: string;
  readonly siteCount: number;
  readonly pairCount: number;
}

/** Escape text for safe inclusion in SVG. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildSchematicMapSvg(input: SchematicMapInput): string {
  // Deterministic scatter: place `siteCount` markers on a fixed grid so the same
  // inputs always yield the same SVG bytes.
  const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, input.siteCount))));
  const markers: string[] = [];
  for (let i = 0; i < input.siteCount; i += 1) {
    const col = i % cols;
    const rowIdx = Math.floor(i / cols);
    const cx = 60 + col * 80;
    const cy = 120 + rowIdx * 60;
    const fill = i % 2 === 0 ? '#2f8f5b' : '#b8621b';
    markers.push(`<circle cx="${cx}" cy="${cy}" r="8" fill="${fill}" stroke="#14231b" stroke-width="1"/>`);
  }
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">` +
    `<rect width="640" height="400" fill="#eef4f0"/>` +
    `<text x="24" y="40" font-family="sans-serif" font-size="20" fill="#14231b">${esc(input.projectName)} — observation sites</text>` +
    `<text x="24" y="66" font-family="sans-serif" font-size="13" fill="#5a6b60">${input.siteCount} sites · ${input.pairCount} before/after pairs (schematic layout)</text>` +
    markers.join('') +
    `<g font-family="sans-serif" font-size="12" fill="#5a6b60">` +
    `<circle cx="480" cy="360" r="7" fill="#2f8f5b"/><text x="494" y="364">before</text>` +
    `<circle cx="560" cy="360" r="7" fill="#b8621b"/><text x="574" y="364">after</text>` +
    `</g>` +
    `</svg>`
  );
}
