/**
 * Phase 5 gate — architectural grep, enforced in-repo so a regression fails CI
 * rather than a manual review.
 *
 *  - §3.11: Cloudinary signing is never hand-rolled. The Cloudinary adapters do
 *    not reach for `node:crypto` / `createHash` / `crypto.subtle` to build a
 *    signature — signing goes through the SDK.
 *  - §3.9: no Cloudinary-as-database read. The Admin listing (`api.resources`,
 *    `resources_by_*`, `.search(`, `api.list(`) appears ONLY in the admin adapter
 *    consumed by the reconciliation job, never in a product read path.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const files = walk(SRC);

/** Strip line and block comments so a doc mention is not mistaken for a call. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('§3.11 — no hand-rolled Cloudinary signing', () => {
  it('the Cloudinary adapters do not use a crypto digest to sign', () => {
    for (const f of files) {
      if (!/plugins\/cloudinary(-admin)?\.ts$/.test(f)) continue;
      const src = stripComments(readFileSync(f, 'utf8'));
      expect(src, `${relative(SRC, f)} imports node:crypto`).not.toMatch(/from ['"]node:crypto['"]/);
      expect(src, `${relative(SRC, f)} uses createHash`).not.toMatch(/createHash|createHmac/);
      expect(src, `${relative(SRC, f)} uses crypto.subtle`).not.toContain('crypto.subtle');
    }
  });
});

describe('§3.9 — Cloudinary Admin listing is quarantined to the reconciliation adapter', () => {
  const ADMIN_ADAPTER = 'plugins/cloudinary-admin.ts';

  it('no product read path calls the Admin resource/search API', () => {
    for (const f of files) {
      const rel = relative(SRC, f);
      if (rel === ADMIN_ADAPTER) continue; // the one sanctioned place
      const src = stripComments(readFileSync(f, 'utf8'));
      expect(src, `${rel} calls api.resources`).not.toMatch(/\.api\.resources\b/);
      expect(src, `${rel} calls resources_by_*`).not.toMatch(/\.resources_by_/);
      expect(src, `${rel} calls the Search API`).not.toMatch(/\.search\(/);
      expect(src, `${rel} calls api.list`).not.toMatch(/\.api\.list\(/);
    }
  });
});
