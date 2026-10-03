/**
 * Change-metric schema validation (Phase "Metrics schema", gate:
 * "an off-schema metric is rejected ... the rejection names the offending key").
 *
 * §3.2 says a number in a report must trace to a versioned model. The complement
 * enforced here is that a number the model emits must belong to the sector's
 * declared schema before it is ever stored — an unrecognised key is how an
 * untraceable metric reaches a report. We refuse it at write time and name the
 * offending key rather than silently persisting it.
 *
 * The schema is `projects.config.metrics_schema` (a `{ key: type }` map) when the
 * project declares one; otherwise a built-in per-sector default is used. Refusing
 * to validate at all (no schema anywhere) would be silent degradation (§3.6), so
 * a sector with neither a config schema nor a default is itself an error.
 */

export type MetricType = 'number' | 'integer' | 'string' | 'boolean';

export type MetricsSchema = Readonly<Record<string, MetricType>>;

/**
 * Built-in per-sector metric schemas. Forestry mirrors the fields the ML
 * `/v1/detect-change` contract documents (api-contracts.md §3). A project may
 * override or extend via `config.metrics_schema`.
 */
export const SECTOR_METRIC_SCHEMAS: Readonly<Record<string, MetricsSchema>> = {
  forestry: {
    saplings_planted: 'number',
    area_covered_sqm: 'number',
    planting_density_per_sqm: 'number',
    before_count: 'number',
    after_count: 'number',
    alignment_quality: 'number',
    canopy_change_pct: 'number',
  },
};

export interface MetricsSchemaResolution {
  readonly schema: MetricsSchema | null;
  readonly source: 'config' | 'sector_default' | 'none';
}

/**
 * Resolve the schema to validate against: a project-declared `metrics_schema`
 * wins, then a built-in sector default, else none.
 */
export function resolveMetricsSchema(
  sector: string | null,
  configSchema: Readonly<Record<string, string>> | undefined,
): MetricsSchemaResolution {
  if (configSchema !== undefined && Object.keys(configSchema).length > 0) {
    const schema: Record<string, MetricType> = {};
    for (const [k, v] of Object.entries(configSchema)) {
      schema[k] = normaliseType(v);
    }
    return { schema, source: 'config' };
  }
  if (sector !== null && sector in SECTOR_METRIC_SCHEMAS) {
    return { schema: SECTOR_METRIC_SCHEMAS[sector] as MetricsSchema, source: 'sector_default' };
  }
  return { schema: null, source: 'none' };
}

function normaliseType(v: string): MetricType {
  switch (v) {
    case 'integer':
      return 'integer';
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    default:
      return 'number';
  }
}

export type MetricsValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly offendingKey: string; readonly reason: string };

function typeMatches(type: MetricType, value: unknown): boolean {
  switch (type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
  }
}

/**
 * Validate a metric bag against the schema. The FIRST offending key is named:
 * either a key absent from the schema, or a key whose value is the wrong type.
 * An empty metric bag is vacuously valid (a failed/manual event carries none).
 */
export function validateChangeMetrics(
  metrics: Readonly<Record<string, unknown>>,
  schema: MetricsSchema,
): MetricsValidation {
  for (const [key, value] of Object.entries(metrics)) {
    const expected = schema[key];
    if (expected === undefined) {
      return {
        ok: false,
        offendingKey: key,
        reason: `metric "${key}" is not in the sector's registered schema`,
      };
    }
    if (!typeMatches(expected, value)) {
      return {
        ok: false,
        offendingKey: key,
        reason: `metric "${key}" must be ${expected}, got ${typeof value}`,
      };
    }
  }
  return { ok: true };
}
