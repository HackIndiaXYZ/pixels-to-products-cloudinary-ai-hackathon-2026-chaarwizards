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
