import type { MetricValue } from '../lib/models';
import { UNKNOWN_COPY, formatNumber } from '../lib/state';
import { ClayCard } from './ClayCard';

export interface MetricCardProps {
  label: string;
  metric: MetricValue;
  /** Where the number came from, so a KPI is never an unattributed figure. */
  source?: string;
}

export function MetricCard({ label, metric, source }: MetricCardProps) {
  return (
    <ClayCard className="pn-stack-3">
      <span className="pn-metric-label">{label}</span>
      {renderValue(metric)}
      {source === undefined ? null : <p className="pn-card-sub pn-mono">{source}</p>}
    </ClayCard>
  );
}

function renderValue(metric: MetricValue) {
  switch (metric.kind) {
    case 'count':
      return (
        <b className="pn-metric-value" style={{ whiteSpace: 'nowrap' }}>
          {formatNumber(metric.value)}
        </b>
      );
    case 'text':
      return <b className="pn-metric-value pn-metric-value-text">{metric.value}</b>;
    case 'rate':
      return (
        <div>
          <b className="pn-metric-value" style={{ whiteSpace: 'nowrap' }}>
            {metric.total === 0 ? (
              UNKNOWN_COPY
            ) : (
              <>
                {formatNumber(metric.verified)}
                <span className="pn-metric-unit"> of {formatNumber(metric.total)}</span>
              </>
            )}
          </b>
          <div className="pn-metric-breakdown">
            <div className="pn-metric-legend">
              <span>Verified (verification = passed)</span>
              <b>{formatNumber(metric.verified)}</b>
            </div>
            <div className="pn-metric-legend">
              <span>Pending — not counted</span>
              <b>{formatNumber(metric.excluded.pending)}</b>
            </div>
            <div className="pn-metric-legend">
              <span>Unknown — not counted</span>
              <b>{formatNumber(metric.excluded.unknown)}</b>
            </div>
            <div className="pn-metric-legend">
              <span>Failed</span>
              <b>{formatNumber(metric.excluded.failed)}</b>
            </div>
          </div>
        </div>
      );
  }
}