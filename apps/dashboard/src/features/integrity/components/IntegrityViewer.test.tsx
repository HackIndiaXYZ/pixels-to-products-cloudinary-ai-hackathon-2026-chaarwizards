import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderView } from '../../../test/render';
import { IntegrityViewer } from './IntegrityViewer';
import { TimestampComparison } from './TimestampComparison';
import { serializeVerificationRecord, buildVerificationRecord } from '../verificationRecord';
import type { AssetIntegrity } from '../../assets/api';
import type { ChainVerification } from '../api';

const allUnknown: AssetIntegrity = {
  asset_id: 'a1',
  device_capture_timestamp: '2024-01-15T09:30:00Z',
  server_upload_timestamp: null,
  server_received_at: null,
  clock_drift_seconds: null,
  gps_accuracy_meters: null,
  gps_provider: null,
  device_signature_verified: null,
  exif_hash_verified: null,
  caption_signature_verified: null,
  audit_chain_intact: null,
  sha256_matches_commit: null,
};

const chainOk: ChainVerification = {
  asset_id: 'a1',
  ok: true,
  checked: 2,
  first_id: 1,
  last_id: 2,
  tip_hash: 'abc123',
  failure: null,
};

const chainBroken: ChainVerification = {
  ...chainOk,
  ok: false,
  failure: { audit_id: 2, kind: 'broken_link', reason: 'a prior row was deleted' },
};

describe('TimestampComparison (§3.7 skew honesty)', () => {
  it('shows the skew as unknown and NEVER as pass when no NTP offset is available', async () => {
    const { container } = await renderView(<TimestampComparison integrity={allUnknown} />);
    expect(screen.getByTestId('skew-verdict').getAttribute('data-verdict')).toBe('unknown');
    // Assert the ABSENCE of the word "pass" in the rendered output, not merely
    // the presence of "unknown" (BUILD_ORDER Phase 10 gate).
    expect(container.textContent?.toLowerCase()).not.toContain('pass');
  });
});

describe('IntegrityViewer', () => {
  it('renders chain visualization, timestamps, and export for an all-unknown, broken-chain asset with no "pass" anywhere', async () => {
    const { container } = await renderView(
      <IntegrityViewer integrity={allUnknown} chain={chainBroken} />,
    );
    expect(screen.getByTestId('chain-visualization')).toBeTruthy();
    expect(screen.getByTestId('timestamp-comparison')).toBeTruthy();
    expect(screen.getByTestId('export-verification')).toBeTruthy();
    // Nothing here passes: every check is unknown and the chain is broken. The
    // word "pass" must not appear (unknown is never laundered into pass, §3.7).
    expect(container.textContent?.toLowerCase()).not.toContain('pass');
  });

  it('exports the deterministic verification record on click', async () => {
    const download = vi.fn();
    await renderView(<IntegrityViewer integrity={allUnknown} chain={chainOk} download={download} />);
    await act(async () => {
      screen.getByTestId('export-verification').click();
    });
    expect(download).toHaveBeenCalledTimes(1);
    const [filename, contents] = download.mock.calls[0] as [string, string];
    expect(filename).toBe('verification-a1.json');
    // The exported bytes equal a fresh serialization of the same inputs, so a
    // second run re-verifies to the same result (evidence, not decoration).
    const expected = serializeVerificationRecord(buildVerificationRecord(chainOk, allUnknown));
    expect(contents).toBe(expected);
  });
});
