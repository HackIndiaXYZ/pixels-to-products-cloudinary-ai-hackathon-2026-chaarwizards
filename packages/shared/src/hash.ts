/**
 * SHA-256 over the RFC 8785 canonical form of a JSON value.
 *
 * This is the digest used by the audit hash chain and by EXIF / signing-payload
 * verification. It is intentionally built on {@link canonicalize} so the hashed
 * bytes are identical to the Python implementation (AGENTS.md §3.8). Never hash
 * `JSON.stringify(value)` or a Postgres `jsonb::text` — those serializers do not
 * agree byte-for-byte.
 */
import { createHash } from 'node:crypto';
import { canonicalize, type JsonValue } from './canonicalize.js';

/** Lowercase-hex SHA-256 of the canonical JSON encoding of `value`. */
export function sha256Canonical(value: JsonValue): string {
  const canonical = canonicalize(value);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
