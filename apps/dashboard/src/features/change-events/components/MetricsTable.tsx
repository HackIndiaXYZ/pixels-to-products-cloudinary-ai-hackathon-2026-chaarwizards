/**
 * Metrics table for a change event (BUILD_ORDER Phase 8 gate — Change review).
 *
 * Every metric is displayed beside the `model_version` that produced it. A
 * metric shown without its version is a gate FAIL, because a number that cannot
 * be traced to a `model_registry` row is not defensible (AGENTS.md §3.2). The
 * version is rendered once per row here so the mapping metric→model is never
 * ambiguous, even across a mixed table.
 */
export interface MetricsTableProps {
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly modelVersion: string;
  readonly confidence?: number | null;
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '—';
  }
  return JSON.stringify(value);
}

export function MetricsTable({ metrics, modelVersion, confidence }: MetricsTableProps) {
  const entries = Object.entries(metrics);

  if (entries.length === 0) {
    return (
      <div data-testid="metrics-empty">
        <p>No CV metrics for this pair.</p>
        <span data-testid="metric-model-version">model {modelVersion}</span>
      </div>
    );
  }

  return (
    <table data-testid="metrics-table">
      <thead>
        <tr>
          <th scope="col">Metric</th>
          <th scope="col">Value</th>
          <th scope="col">Model version</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key} data-testid="metric-row">
            <td>{key}</td>
            <td data-testid="metric-value">{formatValue(value)}</td>
            <td data-testid="metric-model-version">{modelVersion}</td>
          </tr>
        ))}
      </tbody>
      {confidence !== null && confidence !== undefined ? (
        <tfoot>
          <tr>
            <td>confidence</td>
            <td data-testid="metric-confidence">{confidence}</td>
            <td data-testid="metric-model-version">{modelVersion}</td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}
