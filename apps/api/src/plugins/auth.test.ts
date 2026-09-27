import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { verifySupabaseJwt, extractBearer } from './auth.js';
import { HttpError } from '../types.js';
import { TEST_JWT_SECRET, makeToken, ORG_A } from '../testing/fakes.js';

describe('supabase jwt verification', () => {
  it('extracts identity from a valid token', () => {
    const token = makeToken({ orgId: ORG_A, role: 'member', sub: 'u1' });
    const id = verifySupabaseJwt(token, TEST_JWT_SECRET);
    expect(id).toEqual({ userId: 'u1', orgId: ORG_A, role: 'member' });
  });

  it('rejects a token signed with the wrong secret', () => {
    const token = jwt.sign({ sub: 'u1', app_metadata: { org_id: ORG_A, role: 'member' } }, 'wrong');
    expect(() => verifySupabaseJwt(token, TEST_JWT_SECRET)).toThrow(HttpError);
  });

  it('rejects an expired token', () => {
    const token = makeToken({ orgId: ORG_A, role: 'member', expired: true });
    expect(() => verifySupabaseJwt(token, TEST_JWT_SECRET)).toThrow(/expired/);
  });

  it('rejects a token with no org_id claim', () => {
    const token = jwt.sign({ sub: 'u1', app_metadata: { role: 'member' } }, TEST_JWT_SECRET);
    expect(() => verifySupabaseJwt(token, TEST_JWT_SECRET)).toThrow(/org_id/);
  });

  it('rejects a token with an invalid role', () => {
    const token = jwt.sign(
      { sub: 'u1', app_metadata: { org_id: ORG_A, role: 'superuser' } },
      TEST_JWT_SECRET,
    );
    expect(() => verifySupabaseJwt(token, TEST_JWT_SECRET)).toThrow(/role/);
  });

  it('extractBearer requires the Bearer scheme', () => {
    expect(extractBearer('Bearer abc')).toBe('abc');
    expect(() => extractBearer(undefined)).toThrow(HttpError);
    expect(() => extractBearer('Basic abc')).toThrow(HttpError);
  });
});
