import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalize, type JsonValue } from './canonicalize.js';
import { sha256Canonical } from './hash.js';

/**
 * Cross-language conformance. The Python JCS port in Phase 6 loads this same
 * file and asserts identical `canonical` + `sha256` for every vector, so the two
 * implementations are proven byte-identical  rather than assumed.
 */
interface Vector {
  readonly name: string;
  readonly input: JsonValue;
  readonly canonical: string;
  readonly sha256: string;
}
interface FixtureDoc {
  readonly vectors: readonly Vector[];
}

const fixturePath = fileURLToPath(
  new URL('../fixtures/jcs-cross-language.json', import.meta.url),
);
const doc = JSON.parse(readFileSync(fixturePath, 'utf8')) as FixtureDoc;

describe('JCS cross-language fixtures', () => {
  it('exposes at least one vector', () => {
    expect(doc.vectors.length).toBeGreaterThan(0);
  });

  for (const vector of doc.vectors) {
    it(`reproduces canonical bytes for "${vector.name}"`, () => {
      expect(canonicalize(vector.input)).toBe(vector.canonical);
    });

    it(`reproduces sha256 for "${vector.name}"`, () => {
      expect(sha256Canonical(vector.input)).toBe(vector.sha256);
    });
  }
});
