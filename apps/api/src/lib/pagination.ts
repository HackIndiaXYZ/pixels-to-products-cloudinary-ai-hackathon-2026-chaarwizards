/**
 * Opaque cursor pagination (api-contracts.md §7). `limit` defaults to 20 and is
 * clamped to 100 — values above the cap are clamped, not rejected, so a client
 * asking for `limit=500` silently gets 100 rather than an error. The cursor is
 * base64 of the sort key; the client treats it as opaque and never increments an
 * offset.
 */
import { errors } from '../types.js';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const SEARCH_HARD_CAP = 1000;

/** Clamp a requested limit into `[1, MAX_LIMIT]`, defaulting a missing value. */
export function clampLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    throw errors.validation('limit must be a number', { limit: raw });
  }
  const floored = Math.floor(n);
  if (floored < 1) return 1;
  if (floored > MAX_LIMIT) return MAX_LIMIT;
  return floored;
}

/** Encode a sort-key offset into an opaque cursor. */
export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), 'utf8').toString('base64url');
}

/**
 * Decode an opaque cursor back to an offset. A malformed cursor is a client
 * error (`400`), never a silent reset to page zero.
 */
export function decodeCursor(cursor: string | null | undefined): number {
  if (cursor === undefined || cursor === null || cursor === '') return 0;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'o' in parsed &&
      typeof (parsed as { o: unknown }).o === 'number'
    ) {
      const offset = (parsed as { o: number }).o;
      if (Number.isInteger(offset) && offset >= 0) return offset;
    }
    throw errors.validation('malformed cursor');
  } catch {
    throw errors.validation('malformed cursor', { cursor });
  }
}
