/**
 * Deterministic metric serialization for reports (Phase
 * "Determinism"). Numbers are formatted through Decimal.js, never
 * `JSON.stringify` on a float, so binary floating-point drift (`0.1 + 0.2`)
 * cannot change a single byte of the generated artifact between two runs over
 * identical inputs.
 *
 * Every value here originates from a `change_events.change_metrics` object that
 * a versioned CV model already produced . This module only
 * *formats* those numbers for display — it never computes, rounds toward a
 * "nicer" number, or infers a metric.
 */
import Decimal from 'decimal.js';

// A fixed, process-independent Decimal configuration. Left at library defaults
// but pinned explicitly so a future global `Decimal.set` elsewhere cannot change
// how a report serializes a number (determinism is a correctness property here).
const ReportDecimal = Decimal.clone({ precision: 40, toExpNeg: -9e15, toExpPos: 9e15 });

/**
 * Format a single metric value to its canonical string. Integers render without
 * a decimal point; fractional numbers render with their exact decimal expansion
 * (no float rounding). Non-numbers are stringified deterministically.
 */
export function formatMetricValue(value: unknown): string {
  if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)))) {
    // Route through Decimal so 1200.5 is exactly "1200.5", never "1200.4999…".
    const d = new ReportDecimal(value as Decimal.Value);
    return d.toFixed();
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  // Objects/arrays: stable JSON (sorted keys) so the byte output never depends
  // on insertion order.
  return stableJson(value);
}

/** One row of a rendered metrics table, in a fixed key order. */
export interface MetricRow {
  readonly key: string;
  readonly value: string;
}

/**
 * Turn a `change_metrics` object into a deterministically ordered list of
 * display rows. Keys are sorted so the same metrics always render in the same
 * order regardless of how the JSON arrived.
 */
export function serializeMetrics(metrics: Record<string, unknown>): MetricRow[] {
  return Object.keys(metrics)
    .sort()
    .map((key) => ({ key, value: formatMetricValue(metrics[key]) }));
}

/** Deterministic JSON with lexicographically sorted object keys. */
function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}
