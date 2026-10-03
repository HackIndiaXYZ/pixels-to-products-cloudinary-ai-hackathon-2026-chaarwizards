import type { ChangeMetricRow } from '../lib/models';
import { UNAVAILABLE_COPY, UNKNOWN_COPY, fieldLabel } from '../lib/state';
import { ClayCard } from './ClayCard';

export interface MetricTableProps {
  rows: ChangeMetricRow[];
  title?: string;
  subtitle?: string;
}

/** `change_metrics` is opaque JSONB. Only keys actually present are listed, a key whose value
 *  cannot be resolved reads Unknown, and no metric shape is assumed. */
export function MetricTable({ rows, title = 'Change metrics', subtitle }: MetricTableProps) {
  return (
    <ClayCard
      title={title}
      subtitle={subtitle ?? 'Keys read straight from change_metrics. No metric shape is assumed.'}
    >
      {rows.length === 0 ? (
        <p className="pn-unknown">change_metrics holds no keys for this event.</p>
      ) : (
        <div className="pn-table-scroll">
          <table className="pn-table">
            <caption className="pn-visually-hidden">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Key</th>
                <th scope="col">Before</th>
                <th scope="col">After</th>
                <th scope="col">Net change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="pn-mono">
                    {row.key}
                  </th>
                  <td className="pn-mono">{fieldLabel(row.before, UNKNOWN_COPY)}</td>
                  {/* Absent is not the same as unresolved: no `_after` partner key means
                      Unavailable, not Unknown. */}
                  <td className="pn-mono">{fieldLabel(row.after, UNAVAILABLE_COPY)}</td>
                  <td className="pn-mono">{fieldLabel(row.netDelta, UNKNOWN_COPY)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ClayCard>
  );
}