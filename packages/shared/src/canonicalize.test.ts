import { describe, expect, it } from 'vitest';
import { canonicalize, CanonicalizationError, type JsonValue } from './canonicalize.js';
import { sha256Canonical } from './hash.js';

describe('canonicalize — RFC 8785', () => {
  it('sorts object member names by UTF-16 code unit', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ z: { b: 1, a: 2 }, a: 3 })).toBe('{"a":3,"z":{"a":2,"b":1}}');
  });

  it('serializes numbers with the ECMAScript algorithm', () => {
    expect(canonicalize([1, 1.5, 1e30, 2e-3, -0, 100])).toBe('[1,1.5,1e+30,0.002,0,100]');
  });

  it('escapes strings per RFC 8785 §3.2.2.1', () => {
    expect(canonicalize('a"b\\c\n')).toBe('"a\\"b\\\\c\\n"');
  });

  it('renders literals verbatim', () => {
    expect(canonicalize({ a: null, b: true, c: false })).toBe(
      '{"a":null,"b":true,"c":false}',
    );
  });

  it('matches the RFC 8785 worked example byte-for-byte', () => {
    const rfcString = '\u20ac$\u000f\nA\'B"\\\\"/';
    const input: JsonValue = {
      // RFC 8785 tests that this literal rounds to its nearest double
      // (333333333.3333333) and serializes accordingly.
      // eslint-disable-next-line no-loss-of-precision
      numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 0.000000000000000000000000001],
      string: rfcString,
      literals: [null, true, false],
    };
    const expected =
      '{"literals":[null,true,false],' +
      '"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],' +
      '"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}';
    expect(canonicalize(input)).toBe(expected);
  });

  it('is stable regardless of source key insertion order', () => {
    const a = canonicalize({ one: 1, two: 2, three: 3 });
    const b = canonicalize({ three: 3, two: 2, one: 1 });
    expect(a).toBe(b);
  });

  it('drops undefined object members like JSON.stringify', () => {
    const value = { a: 1, b: undefined, c: 3 } as unknown as JsonValue;
    expect(canonicalize(value)).toBe('{"a":1,"c":3}');
  });

  it('rejects non-finite numbers rather than coercing to null', () => {
    expect(() => canonicalize([Number.NaN] as unknown as JsonValue)).toThrow(
      CanonicalizationError,
    );
    expect(() => canonicalize(Number.POSITIVE_INFINITY as unknown as JsonValue)).toThrow(
      CanonicalizationError,
    );
  });

  it('rejects a top-level undefined', () => {
    expect(() => canonicalize(undefined as unknown as JsonValue)).toThrow(
      CanonicalizationError,
    );
  });
});

describe('sha256Canonical', () => {
  it('hashes the canonical form, independent of key order', () => {
    const a = sha256Canonical({ b: 2, a: 1 });
    const b = sha256Canonical({ a: 1, b: 2 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches a known SHA-256 of the canonical bytes', () => {
    // canonicalize({}) === '{}'; sha256 of '{}' is well-known.
    expect(sha256Canonical({})).toBe(
      '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
    );
  });
});
