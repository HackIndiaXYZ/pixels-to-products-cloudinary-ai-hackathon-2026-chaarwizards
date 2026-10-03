import { Fragment } from 'react';
import { ClayCard } from '../components/ClayCard';
import { DataBoundary } from '../components/DataBoundary';
import { EmptyState } from '../components/EmptyState';
import { IntegrityBadge } from '../components/IntegrityBadge';
import { MetricTable } from '../components/MetricTable';
import { Skeleton } from '../components/Skeleton';
import { StatusBadge } from '../components/StatusBadge';
import { HashDisplay } from '../components/HashDisplay';
import {
  EMPTY_COPY,
  UNAVAILABLE_MASK_COPY,
  UNAVAILABLE_REASON_COPY,
  UNKNOWN_COPY,
  UNSUPPORTED_SECTOR_COPY,
  empty,
  failed,
  fieldUnknown,
  loading,
  unauthorized,
  undetermined,
  type DataState,
} from '../lib/state';

export const HARNESS_STATES = ['loading', 'empty', 'error', 'unauthorized', 'unknown', 'ready'] as const;
export type HarnessState = (typeof HARNESS_STATES)[number];

export function isHarnessState(value: string | null): value is HarnessState {
  return value !== null && (HARNESS_STATES as readonly string[]).includes(value);
}

/** The review harness. `?state=` in the URL selects one honest state at a time. It never invents
 *  business values: the only real data it renders is the live app itself (`state=ready`), every
 *  other state is the real component tree with a genuine `DataState` that has no rows, a refusal,
 *  or a column the backend could not determine. */
export function ReviewHarness({ state }: { state: HarnessState }) {
  return (
    <div className="pn-harness">
      <div className="pn-harness-inner">
        <div className="pn-harness-bar">
          <StatusBadge label="Review harness" tone="info" glyph="layers" />
          <span className="pn-evidence-meta">
            <code>?state=</code> drives one honest state at a time. Nothing here is mock data.
          </span>
        </div>

        <div className="pn-harness-bar" role="group" aria-label="Harness states">
          {HARNESS_STATES.map((entry) => (
            <a
              key={entry}
              className="pn-btn pn-btn-sm"
              href={entry === 'ready' ? './index.html' : `./index.html?state=${entry}`}
              aria-current={entry === state ? 'page' : undefined}
            >
              {entry}
            </a>
          ))}
        </div>

        <div className="pn-harness-block">
          <div className="pn-harness-heading">
            <h1 className="pn-page-title">{state}</h1>
            <p className="pn-page-lede">{describe(state)}</p>
          </div>
          {state === 'ready' ? <ReadyLive /> : <StatePanels state={state} />}
        </div>
      </div>
    </div>
  );
}

function describe(state: HarnessState): string {
  switch (state) {
    case 'loading':
      return 'A skeleton with the real dimensions. No zero, no dash, no empty card pretending to be data.';
    case 'empty':
      return 'The query succeeded and returned nothing. The screen says so in words instead of showing a blank panel.';
    case 'error':
      return 'The read failed. The message names the failure and offers a retry rather than swallowing it.';
    case 'unauthorized':
      return 'Row-level security refused the read. The screen explains it; it never pretends the data is missing.';
    case 'unknown':
      return 'The backend could not determine the value. It is shown as Unknown — never as zero, never as a pass.';
    case 'ready':
      return 'The live application, reading real Postgres through Supabase with row-level security.';
  }
}

/** `state=ready` is the product itself, not a fixture. There are no invented rows anywhere. */
function ReadyLive() {
  return (
    <ClayCard title="Live application">
      <p className="pn-state-body">
        Open the real interface without the harness parameter. Every figure comes from a query under
        row-level security, so what you see depends on the session and the deployed schema.
      </p>
      <div className="pn-row pn-row-wrap">
        <a className="pn-btn pn-btn-primary" href="./index.html">
          Open the application
        </a>
      </div>
    </ClayCard>
  );
}

function StatePanels({ state }: { state: Exclude<HarnessState, 'ready'> }) {
  return (
    <>
      <ClayCard title="Boundary" subtitle="The same DataBoundary the product uses.">
        <DataBoundary state={panelState(state)} onReady={() => null} />
      </ClayCard>

      <ClayCard title="Honest copy for absent things" subtitle="Each string is used verbatim in the product.">
        <div className="pn-stack-3">
          <CopyRow label="No geotagged evidence" value={EMPTY_COPY.geospatial} />
          <CopyRow label="No report templates" value={EMPTY_COPY.templates} />
          <CopyRow label="No assets in quarantine" value={EMPTY_COPY.quarantine} />
          <CopyRow label="Unpaired change event reason" value={UNAVAILABLE_REASON_COPY} />
          <CopyRow label="Absent change mask" value={UNAVAILABLE_MASK_COPY} />
          <CopyRow label="Unregistered sector" value={UNSUPPORTED_SECTOR_COPY} />
          <CopyRow label="NULL integrity boolean" value={UNKNOWN_COPY} />
        </div>
      </ClayCard>

      <ClayCard title="Badges" subtitle="Colour is never the only signal.">
        <div className="pn-cluster">
          <StatusBadge label="Verified" tone="pass" />
          <StatusBadge label="Pending" tone="pending" />
          <StatusBadge label="Flagged" tone="flagged" />
          <StatusBadge label="Failed" tone="fail" />
          <StatusBadge label="Unknown" tone="unknown" />
          <IntegrityBadge state="pass" />
          <IntegrityBadge state="fail" />
          <IntegrityBadge state="unknown" />
        </div>
      </ClayCard>

      <ClayCard title="Hashes" subtitle="Byte-exact, monospace, never abbreviated.">
        <div className="pn-stack-3">
          <HashDisplay value={fieldUnknown<string | null>()} label="assets.sha256_hash when the column is NULL" />
          <p className="pn-evidence-meta">
            A real hash is always shown in full, because a shortened digest cannot be checked against
            the manifest. No example digest is printed here — an invented hash on a review screen is
            still an invented hash.
          </p>
        </div>
      </ClayCard>

      <ClayCard title="Empty metric set" subtitle="change_metrics held no keys.">
        <MetricTable rows={[]} />
      </ClayCard>

      <ClayCard title="Empty state copy" subtitle="Returned nothing on purpose.">
        <EmptyState title={EMPTY_COPY.changes} body="Filters are applied on the server, so an empty result is a real result." />
      </ClayCard>

      <ClayCard title="Loading" subtitle="Real dimensions, no fake content.">
        <Skeleton lines={4} />
      </ClayCard>
    </>
  );
}

function panelState(state: Exclude<HarnessState, 'ready'>): DataState<null> {
  switch (state) {
    case 'loading':
      return loading<null>();
    case 'empty':
      return empty<null>(EMPTY_COPY.evidence);
    case 'error':
      return failed<null>();
    case 'unauthorized':
      return unauthorized<null>('org_admin');
    case 'unknown':
      return undetermined<null>();
  }
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <Fragment>
      <p className="pn-evidence-meta">{label}</p>
      <p className="pn-mono pn-unknown">{value}</p>
    </Fragment>
  );
}