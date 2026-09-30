import { describe, expect, it } from 'vitest';
import { ORG_A, makeFakeDb } from '../testing/fakes.js';
import type { AuthContext } from '../types.js';
import {
  findDetailsTamper,
  mergeChainResults,
  verifyChain,
} from './chain-verifier.js';
import type { ChainRangeResult } from '../ports.js';

const ctxA: AuthContext = { userId: 'u1', orgId: ORG_A, role: 'member' };

/** Seed an asset with an N-row audit chain in ORG_A. */
async function seedChain(rows: number) {
  const db = makeFakeDb();
  const project = db.seedProject({ org_id: ORG_A });
  const asset = db.seedAsset({ org_id: ORG_A, project_id: project.id });
  for (let i = 0; i < rows; i += 1) {
    await db.audit.append({
      assetId: asset.id,
      action: 'verify',
      actorType: 'system',
      actorId: 'api',
      details: { step: i },
    });
  }
  return { db, assetId: asset.id };
}

describe('findDetailsTamper (RFC 8785 content consistency)', () => {
  it('returns null when every row canonicalizes to its stored canonical', () => {
    const rows = [
      { id: 1, action: 'a', details: { b: 1, a: 2 }, details_canonical: '{"a":2,"b":1}' },
      { id: 2, action: 'a', details: null, details_canonical: 'null' },
    ];
    expect(findDetailsTamper(rows)).toBeNull();
  });

  it('names the row whose raw details no longer canonicalize to details_canonical', () => {
    // details_canonical is the ORIGINAL; details was tampered afterwards. The
    // hash (over details_canonical) would still verify — only re-canonicalizing
    // the raw details catches this.
    const rows = [
      { id: 7, action: 'a', details: { saplings: 999 }, details_canonical: '{"saplings":49}' },
    ];
    const failure = findDetailsTamper(rows);
    expect(failure?.audit_id).toBe(7);
    expect(failure?.kind).toBe('details_tampered');
  });
});

describe('mergeChainResults', () => {
  const clean: ChainRangeResult = {
    ok: true,
    checked: 3,
    first_id: 1,
    last_id: 3,
    tip_hash: 'tip',
    failure: null,
  };

  it('is ok only when neither check failed', () => {
    expect(mergeChainResults('a', clean, null).ok).toBe(true);
  });

  it('reports the earliest failing row across the two checks', () => {
    const range: ChainRangeResult = {
      ...clean,
      ok: false,
      failure: { audit_id: 5, kind: 'hash_mismatch', reason: 'r' },
    };
    const details = { audit_id: 2, kind: 'details_tampered' as const, reason: 'd' };
    expect(mergeChainResults('a', range, details).failure?.audit_id).toBe(2);
    const details2 = { audit_id: 9, kind: 'details_tampered' as const, reason: 'd' };
    expect(mergeChainResults('a', range, details2).failure?.audit_id).toBe(5);
  });
});

describe('verifyChain over the fake audit store', () => {
  it('verifies an intact chain', async () => {
    const { db, assetId } = await seedChain(3);
    const result = await verifyChain(db, ctxA, assetId, null, null);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(3);
    expect(result.failure).toBeNull();
  });

  it('FAILURE PATH: a tampered value breaks verification and names that row', async () => {
    const { db, assetId } = await seedChain(3);
    // Tamper the stored canonical of the middle row (a content mutation). The
    // recomputed hash no longer matches the stored current_hash.
    const middle = db._audit[1];
    if (middle === undefined) throw new Error('expected 3 rows');
    middle.details_canonical = '{"step":999}';
    const result = await verifyChain(db, ctxA, assetId, null, null);
    expect(result.ok).toBe(false);
    expect(result.failure?.kind).toBe('hash_mismatch');
    expect(result.failure?.audit_id).toBe(middle.id);
  });

  it('FAILURE PATH: a missing intermediate row is detected as a gap, not skipped', async () => {
    const { db, assetId } = await seedChain(3);
    const survivorSuccessorId = db._audit[2]?.id;
    // Delete the intermediate row. The surviving successor's previous_hash now
    // points at a hash that is no longer its predecessor → broken_link.
    db._audit.splice(1, 1);
    const result = await verifyChain(db, ctxA, assetId, null, null);
    expect(result.ok).toBe(false);
    expect(result.failure?.kind).toBe('broken_link');
    expect(result.failure?.audit_id).toBe(survivorSuccessorId);
  });

  it('FAILURE PATH: a raw details tamper (canonical intact) is caught by the JCS check', async () => {
    const { db, assetId } = await seedChain(2);
    const row = db._audit[0];
    if (row === undefined) throw new Error('expected a row');
    // Mutate raw details only; leave details_canonical (and thus the hash) intact.
    row.details = { step: 424242 };
    const result = await verifyChain(db, ctxA, assetId, null, null);
    expect(result.ok).toBe(false);
    expect(result.failure?.kind).toBe('details_tampered');
    expect(result.failure?.audit_id).toBe(row.id);
  });

  it('a cross-org asset yields an empty chain, never another org\'s rows', async () => {
    const { db, assetId } = await seedChain(3);
    const otherCtx: AuthContext = { userId: 'u2', orgId: '99999999-9999-9999-9999-999999999999', role: 'member' };
    const result = await verifyChain(db, otherCtx, assetId, null, null);
    expect(result.checked).toBe(0);
  });
});
