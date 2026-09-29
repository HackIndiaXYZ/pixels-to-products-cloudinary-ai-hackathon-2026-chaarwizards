import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderView } from '../../../test/render';
import { AssetDetail } from './AssetDetail';
import type { AssetIntegrity } from '../api';
import type { AssetSearchResultRow } from '../../search/types';

const asset: AssetSearchResultRow = {
  id: 'a1',
  project_id: 'p1',
  cloudinary_public_id: 'org/p1/sha',
  asset_type: 'image',
  device_capture_timestamp: '2024-01-15T09:30:00Z',
  gps_point: { type: 'Point', coordinates: [72.8, 19.1] },
  gps_accuracy_meters: 3.2,
  gps_provider: 'fused',
  caption: 'Planted 50',
  ai_tags: ['tree'],
  observation_type: 'planting',
  phase: 'before',
  upload_status: 'verified',
};

const integrity: AssetIntegrity = {
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

/**
 * BUILD_ORDER Phase 8 gate — asset detail must render all three async states
 * for its integrity and lineage sub-views (never a blank panel), plus the
 * capture context and media viewer.
 */
describe('AssetDetail', () => {
  it('renders loading for integrity and lineage while both are pending', async () => {
    await renderView(
      <AssetDetail
        asset={asset}
        originalUrl={null}
        integrityStatus="pending"
        integrity={undefined}
        derivativesStatus="pending"
        derivatives={undefined}
      />,
    );
    expect(screen.getAllByTestId('async-loading').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('media-pending')).toBeInTheDocument();
  });

  it('renders an explicit error for a failed integrity fetch, never a blank panel', async () => {
    await renderView(
      <AssetDetail
        asset={asset}
        originalUrl={null}
        integrityStatus="error"
        integrity={undefined}
        integrityError={new Error('integrity unavailable')}
        derivativesStatus="pending"
        derivatives={undefined}
      />,
    );
    expect(screen.getByTestId('async-error')).toHaveTextContent('integrity unavailable');
  });

  it('renders the integrity panel, lineage, and media on success', async () => {
    await renderView(
      <AssetDetail
        asset={asset}
        originalUrl="https://res.cloudinary.com/x/image/authenticated/org/p1/sha"
        integrityStatus="success"
        integrity={integrity}
        derivativesStatus="success"
        derivatives={{ data: [] }}
      />,
    );
    expect(screen.getByTestId('integrity-panel')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-tree')).toBeInTheDocument();
    expect(screen.getByTestId('media-image')).toBeInTheDocument();
    expect(screen.getByTestId('gps-accuracy')).toHaveTextContent('±3.2 m');
  });
});
