import type { AssetVerification, UploadStatus } from '../types/database';
import type { IconName } from './Icon';
import { Icon } from './Icon';

export type BadgeTone = 'pass' | 'pending' | 'flagged' | 'fail' | 'info' | 'unknown';

export interface StatusBadgeProps {
  label: string;
  tone: BadgeTone;
  glyph?: IconName;
  title?: string;
}

/** Colour is never the only signal: every badge carries its own text label and an outlined glyph. */
export function StatusBadge({ label, tone, glyph, title }: StatusBadgeProps) {
  return (
    <span className={`pn-badge pn-badge-${tone}`} title={title ?? label}>
      <Icon name={glyph ?? defaultGlyph(tone)} size={13} className="pn-badge-glyph" />
      {label}
    </span>
  );
}

function defaultGlyph(tone: BadgeTone): IconName {
  switch (tone) {
    case 'pass':
      return 'check';
    case 'fail':
      return 'cross';
    case 'flagged':
      return 'warning';
    case 'pending':
      return 'clock';
    case 'info':
      return 'layers';
    case 'unknown':
      return 'unknown';
  }
}

/* `assets.verification` and `assets.upload_status` are separate vocabularies and are never merged
   into one badge. `pending` and `unknown` are explicitly not verified. */

export function VerificationBadge({ verification }: { verification: AssetVerification }) {
  switch (verification) {
    case 'passed':
      return <StatusBadge label="Verified" tone="pass" />;
    case 'failed':
      return <StatusBadge label="Verification failed" tone="fail" />;
    case 'unknown':
      return <StatusBadge label="Verification unknown" tone="unknown" />;
    case 'pending':
      return <StatusBadge label="Verification pending" tone="pending" />;
  }
}

export function UploadStatusBadge({ status }: { status: UploadStatus }) {
  switch (status) {
    case 'verified':
      return <StatusBadge label="Processed" tone="info" glyph="layers" />;
    case 'flagged':
      return <StatusBadge label="Flagged" tone="flagged" />;
    case 'pending':
      return <StatusBadge label="Upload pending" tone="pending" />;
  }
}

export function PhaseBadge({ phase }: { phase: 'before' | 'after' | null }) {
  if (phase === null) return <StatusBadge label="Phase unknown" tone="unknown" />;
  return <StatusBadge label={phase === 'before' ? 'Before' : 'After'} tone="info" glyph="change" />;
}

export function QuarantineBadge({ quarantinedAt }: { quarantinedAt: string | null }) {
  if (quarantinedAt === null) return null;
  return <StatusBadge label="Quarantined" tone="flagged" glyph="warning" title={`quarantined_at ${quarantinedAt}`} />;
}

export function UnsupportedSectorBadge() {
  return <StatusBadge label="Unsupported sector" tone="unknown" glyph="unknown" />;
}