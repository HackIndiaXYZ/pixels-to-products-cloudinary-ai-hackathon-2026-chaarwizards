/**
 * RFC 8785 — JSON Canonicalization Scheme (JCS).
 *
 * Produces a byte-deterministic serialization of a JSON value so that the same
 * logical value hashes to the same digest in TypeScript and Python (system specifications
 * §3.8). The canonical string is what the capture app signs and what the audit
 * hash chain feeds into SHA-256.
 *
 * Conformance notes:
 * - Object member names are sorted by their UTF-16 code units. JavaScript's
 *   default string ordering compares by UTF-16 code unit, so `.sort()` is the
 *   correct order for RFC 8785.
 * - Numbers are serialized with the ECMAScript `Number`-to-string algorithm,
 *   which is exactly what V8's `String(n)` implements and which RFC 8785 §3.2.2
 *   mandates. Non-finite numbers are rejected — JSON has no representation for
 *   them and silently coercing to `null` would corrupt a signed payload.
 * - Strings reuse `JSON.stringify`'s escaping, which matches RFC 8785 §3.2.2.1:
 *   minimal escaping, lowercase `\uXXXX` for control characters, no escaping of
 *   the forward slash.
 * - `undefined` object members are dropped (as `JSON.stringify` does); an
 *   `undefined`, function, or symbol passed as the top-level value is rejected.
 */

/** The set of values that can appear in canonical JSON. */
export type JsonPrimitive = string | number | boolean | null;
export interface JsonObject {
  readonly [key: string]: JsonValue | undefined;
}
export type JsonArray = readonly JsonValue[];
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** Thrown when a value cannot be represented as canonical JSON. */
export class CanonicalizationError extends Error {
  public override readonly name = 'CanonicalizationError';
  public constructor(message: string) {
    super(message);
  }
}

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new CanonicalizationError(
      `cannot canonicalize non-finite number: ${String(value)}`,
    );
  }
  // String(-0) === '0' in ECMAScript, which is what RFC 8785 requires.
  return String(value);
}

function serializeString(value: string): string {
  // JSON.stringify of a string yields RFC 8785-conformant escaping.
  return JSON.stringify(value);
}

function serializeValue(value: JsonValue): string {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'string':
      return serializeString(value);
    case 'number':
      return serializeNumber(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'object':
      break;
    default:
      throw new CanonicalizationError(`cannot canonicalize type: ${typeof value}`);
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => serializeValue(coerceElement(item)));
    return `[${items.join(',')}]`;
  }

  const obj = value as JsonObject;
  // Sort keys by UTF-16 code unit order (RFC 8785 §3.2.3).
  const keys = Object.keys(obj).sort();
  const members: string[] = [];
  for (const key of keys) {
    const member = obj[key];
    if (member === undefined) {
      // Mirror JSON.stringify: an explicit `undefined` member is omitted.
      continue;
    }
    members.push(`${serializeString(key)}:${serializeValue(member)}`);
  }
  return `{${members.join(',')}}`;
}

function coerceElement(item: JsonValue | undefined): JsonValue {
  // Array holes / `undefined` elements serialize as `null`, matching JSON.stringify.
  return item === undefined ? null : item;
}

/**
 * Serialize a JSON value to its RFC 8785 canonical form.
 *
 * @throws {CanonicalizationError} if the value contains a non-finite number or
 *   a non-JSON type at the top level.
 */
export function canonicalize(value: JsonValue): string {
  if (value === undefined) {
    throw new CanonicalizationError('cannot canonicalize `undefined` at the top level');
  }
  return serializeValue(value);
}
