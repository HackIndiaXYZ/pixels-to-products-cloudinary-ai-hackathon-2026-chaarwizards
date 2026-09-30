import type { AssetIntegrity } from '../../assets/api';

/**
 * Timestamp comparison (BUILD_ORDER Phase 10 — "timestamp comparison").
 *
 * Shows the device capture time against the server upload/receipt times. The
 * clock offset is presented HONESTLY (AGENTS.md §3.7): `server_received_at -
 * device_capture_timestamp` conflates dwell, latency, and skew, so it is labelled
 * a raw drift, never a skew verdict. When no signed NTP offset is available the
 * skew is `unknown` — and `unknown` is NEVER rendered as `pass`.
 */
export interface TimestampComparisonProps {
  readonly integrity: AssetIntegrity;
}

export function TimestampComparison({ integrity }: TimestampComparisonProps) {
  // The flat contract carries no signed NTP offset, so the true clock skew is
  // unknown here; we surface that state explicitly rather than implying a pass.
  const skewVerdict = 'unknown';
  return (
    <section aria-label="Timestamps" data-testid="timestamp-comparison">
      <dl>
        <div>
          <dt>Device capture</dt>
          <dd data-testid="ts-device">{integrity.device_capture_timestamp}</dd>
        </div>
        <div>
          <dt>Server upload</dt>
          <dd data-testid="ts-upload">{integrity.server_upload_timestamp ?? '—'}</dd>
        </div>
        <div>
          <dt>Server received</dt>
          <dd data-testid="ts-received">{integrity.server_received_at ?? '—'}</dd>
        </div>
        <div>
          <dt>Raw drift (not a skew check)</dt>
          <dd data-testid="ts-drift">
            {integrity.clock_drift_seconds === null ? '—' : `${integrity.clock_drift_seconds}s`}
          </dd>
        </div>
        <div>
          <dt>Clock skew (needs signed NTP offset)</dt>
          <dd>
            <span
              className={`verdict verdict-${skewVerdict}`}
              data-testid="skew-verdict"
              data-verdict={skewVerdict}
            >
              {skewVerdict}
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
