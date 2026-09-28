/**
 * SHA-256 over the RFC 8785 canonical form of a JSON value.
 *
 * This is the digest used by the audit hash chain and by EXIF / signing-payload
 * verification. It is intentionally built on {@link canonicalize} so the hashed
 * bytes are identical to the Python implementation (AGENTS.md §3.8). Never hash
 * `JSON.stringify(value)` or a Postgres `jsonb::text` — those serializers do not
 * agree byte-for-byte.
 *
 * Uses pure-JS `@noble/hashes` rather than `node:crypto` so the exact same
 * implementation runs under Node (API, tests) and under React Native (the
 * capture app), which has no `node:crypto`. The digest is byte-identical to a
 * `node:crypto` SHA-256 — both are the standard algorithm.
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalize, type JsonValue } from './canonicalize.js';

/** Lowercase-hex SHA-256 of the canonical JSON encoding of `value`. */
export function sha256Canonical(value: JsonValue): string {
  const canonical = canonicalize(value);
  return bytesToHex(sha256(new TextEncoder().encode(canonical)));
}
