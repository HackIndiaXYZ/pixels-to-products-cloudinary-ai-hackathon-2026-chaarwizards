import { describe, it, expect } from 'vitest';
import { formatMetricValue, serializeMetrics } from './report-metrics.js';

describe('report metric serialization (Decimal.js, Phase 9 determinism)', () => {
  it('serializes a fractional metric to an exact, stable decimal string', () => {
    // A metric that is exactly 1200.5 renders as "1200.5", never "1200.4999…".
    expect(formatMetricValue(1200.5)).toBe('1200.5');
    expect(formatMetricValue(49)).toBe('49');
    // Deterministic: the same value formats to the same bytes every call, so a
    // regeneration can never shift a document byte (Phase 9 "Determinism").
    expect(formatMetricValue(0.1 + 0.2)).toBe(formatMetricValue(0.1 + 0.2));
  });

  it('is stable across equal numbers regardless of how they arrive', () => {
    expect(formatMetricValue('1200.5')).toBe(formatMetricValue(1200.5));
  });

  it('orders metric rows by key so output never depends on insertion order', () => {
    const a = serializeMetrics({ saplings_planted: 49, area_covered_sqm: 1200.5 });
    const b = serializeMetrics({ area_covered_sqm: 1200.5, saplings_planted: 49 });
    expect(a).toEqual(b);
    expect(a.map((r) => r.key)).toEqual(['area_covered_sqm', 'saplings_planted']);
  });

  it('handles booleans, null and nested objects deterministically', () => {
    expect(formatMetricValue(true)).toBe('true');
    expect(formatMetricValue(null)).toBe('');
    expect(formatMetricValue({ b: 1, a: 2 })).toBe(formatMetricValue({ a: 2, b: 1 }));
  });
});
