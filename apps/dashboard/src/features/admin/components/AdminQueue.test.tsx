import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderView } from '../../../test/render';
import { AdminQueue } from './AdminQueue';
import type { AssetSearchResultRow } from '../../search/types';

function row(id: string, status: AssetSearchResultRow['upload_status']): AssetSearchResultRow {
  return {
    id,
    project_id: 'p1',
    cloudinary_public_id: `org/p1/${id}`,
    asset_type: 'image',
    device_capture_timestamp: '2024-01-15T09:30:00Z',
    gps_point: null,
    gps_accuracy_meters: null,
    gps_provider: null,
    caption: null,
    ai_tags: [],
    observation_type: null,
    phase: null,
    upload_status: status,
  };
}

describe('AdminQueue — three states + quarantine filtering', () => {
  it('renders loading', async () => {
    await renderView(<AdminQueue status="pending" data={undefined} />);
    expect(screen.getByTestId('async-loading')).toBeInTheDocument();
  });

  it('renders error explicitly', async () => {
    await renderView(<AdminQueue status="error" data={undefined} error={new Error('nope')} />);
    expect(screen.getByTestId('async-error')).toHaveTextContent('nope');
  });

  it('shows only flagged (quarantined) assets, and empty when none are flagged', async () => {
    await renderView(<AdminQueue status="success" data={[row('a', 'verified'), row('b', 'pending')]} />);
    expect(screen.getByTestId('async-empty')).toBeInTheDocument();
  });

  it('lists a flagged asset in the queue', async () => {
    await renderView(
      <AdminQueue status="success" data={[row('a', 'verified'), row('b', 'flagged')]} />,
    );
    const rows = screen.getAllByTestId('quarantine-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('org/p1/b');
  });
});
