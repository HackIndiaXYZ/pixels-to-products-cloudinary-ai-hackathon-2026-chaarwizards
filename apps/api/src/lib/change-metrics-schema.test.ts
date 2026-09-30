import { describe, expect, it } from 'vitest';
import {
  resolveMetricsSchema,
  validateChangeMetrics,
  SECTOR_METRIC_SCHEMAS,
  type MetricsSchema,
} from './change-metrics-schema.js';

describe('resolveMetricsSchema', () => {
  it('prefers a project-declared metrics_schema', () => {
    const res = resolveMetricsSchema('forestry', { custom_metric: 'number' });
    expect(res.source).toBe('config');
    expect(res.schema).toEqual({ custom_metric: 'number' });
  });

  it('falls back to the sector default when config omits a schema', () => {
    const res = resolveMetricsSchema('forestry', undefined);
    expect(res.source).toBe('sector_default');
    expect(res.schema).toBe(SECTOR_METRIC_SCHEMAS.forestry);
  });

  it('resolves to none for an unknown sector with no config schema', () => {
    const res = resolveMetricsSchema('unknown_sector', undefined);
    expect(res.source).toBe('none');
    expect(res.schema).toBeNull();
  });
});

describe('validateChangeMetrics — gate: an off-schema metric is rejected, naming the key', () => {
  const schema: MetricsSchema = {
    saplings_planted: 'number',
    area_covered_sqm: 'number',
  };

  it('accepts metrics whose keys and types are all in the schema', () => {
    const res = validateChangeMetrics({ saplings_planted: 49, area_covered_sqm: 1200.5 }, schema);
    expect(res.ok).toBe(true);
  });

  it('rejects an unrecognised key and names it', () => {
    const res = validateChangeMetrics({ saplings_planted: 49, bogus_metric: 7 }, schema);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.offendingKey).toBe('bogus_metric');
      expect(res.reason).toContain('bogus_metric');
      expect(res.reason).toContain('registered schema');
    }
  });

  it('rejects a schema key with the wrong type and names it', () => {
    const res = validateChangeMetrics({ saplings_planted: 'many' }, schema);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.offendingKey).toBe('saplings_planted');
      expect(res.reason).toContain('must be number');
    }
  });

  it('treats an empty metric bag as vacuously valid (failed/manual rows)', () => {
    expect(validateChangeMetrics({}, schema).ok).toBe(true);
  });
});

describe('metric type normalisation + matching (all types)', () => {
  it('normalises every declared config type', () => {
    const res = resolveMetricsSchema('forestry', {
      an_int: 'integer',
      a_str: 'string',
      a_bool: 'boolean',
      a_num: 'number',
      unknown_becomes_number: 'float',
    });
    expect(res.schema).toEqual({
      an_int: 'integer',
      a_str: 'string',
      a_bool: 'boolean',
      a_num: 'number',
      unknown_becomes_number: 'number',
    });
  });

  it('accepts correctly-typed integer / string / boolean values', () => {
    const s: MetricsSchema = { n: 'integer', s: 'string', b: 'boolean' };
    expect(validateChangeMetrics({ n: 3, s: 'ok', b: true }, s).ok).toBe(true);
  });

  it('rejects a non-integer number, a non-string, and a non-boolean, naming each', () => {
    const s: MetricsSchema = { n: 'integer', s: 'string', b: 'boolean' };
    const badInt = validateChangeMetrics({ n: 3.5 }, s);
    expect(badInt.ok).toBe(false);
    if (!badInt.ok) expect(badInt.reason).toContain('must be integer');
    const badStr = validateChangeMetrics({ s: 5 }, s);
    expect(badStr.ok).toBe(false);
    if (!badStr.ok) expect(badStr.reason).toContain('must be string');
    const badBool = validateChangeMetrics({ b: 'yes' }, s);
    expect(badBool.ok).toBe(false);
    if (!badBool.ok) expect(badBool.reason).toContain('must be boolean');
  });
});
