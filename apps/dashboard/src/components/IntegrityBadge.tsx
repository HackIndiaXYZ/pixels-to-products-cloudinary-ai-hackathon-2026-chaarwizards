import type { IntegrityState } from '../types/database';
import { StatusBadge } from './StatusBadge';

const COPY: Record<IntegrityState, { label: string; tone: 'pass' | 'fail' | 'unknown' }> = {
  pass: { label: 'Pass', tone: 'pass' },
  fail: { label: 'Fail', tone: 'fail' },
  unknown: { label: 'Cannot determine', tone: 'unknown' },
};

/** `integrity_state` is exactly `pass | fail | unknown`. A NULL RPC boolean is `unknown` and is
 *  rendered as "Cannot determine" — it is never shown as a pass. */
export function IntegrityBadge({ state }: { state: IntegrityState }) {
  const copy = COPY[state];
  return <StatusBadge label={copy.label} tone={copy.tone} />;
}

export function IntegrityStateLegend({ states }: { states: IntegrityState[] }) {
  return (
    <ul className="pn-cluster" role="list">
      {states.map((state, index) => (
        <li key={`${state}-${index}`}>
          <IntegrityBadge state={state} />
        </li>
      ))}
    </ul>
  );
}