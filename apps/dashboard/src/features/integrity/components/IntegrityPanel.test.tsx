import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderView } from '../../../test/render';
import { IntegrityPanel } from './IntegrityPanel';
import type { AssetIntegrity } from '../../assets/api';

const base: AssetIntegrity = {
  asset_id: 'a1',
  device_capture_timestamp: '2024-01-15T09:30:00Z',
  server_upload_timestamp: '2024-01-15T09:30:05Z',
  server_received_at: '2024-01-15T09:30:05.123Z',
  clock_drift_seconds: 5,
  gps_accuracy_meters: 3.2,
  gps_provider: 'fused',
  device_signature_verified: true,
  exif_hash_verified: true,
  caption_signature_verified: true,
  audit_chain_intact: true,
  sha256_matches_commit: true,
};

describe('IntegrityPanel', () => {
  it('shows overall pass when every check passes', async () => {
    await renderView(<IntegrityPanel integrity={base} />);
    const badges = screen.getAllByTestId('verdict');
    // 5 checks + 1 overall, all pass.
    expect(badges.every((b) => b.getAttribute('data-verdict') === 'pass')).toBe(true);
  });

  it('a null check renders unknown and the overall is unknown, never pass (§3.7)', async () => {
    await renderView(<IntegrityPanel integrity={{ ...base, caption_signature_verified: null }} />);
    const overall = screen.getByTestId('integrity-panel').querySelector('header [data-verdict]');
    expect(overall?.getAttribute('data-verdict')).toBe('unknown');
    // The word "pass" must not appear as an overall verdict on an unknown asset.
    expect(overall?.textContent).not.toBe('pass');
  });

  it('a failed check makes the overall fail', async () => {
    await renderView(<IntegrityPanel integrity={{ ...base, sha256_matches_commit: false }} />);
    const overall = screen.getByTestId('integrity-panel').querySelector('header [data-verdict]');
    expect(overall?.getAttribute('data-verdict')).toBe('fail');
  });
});
