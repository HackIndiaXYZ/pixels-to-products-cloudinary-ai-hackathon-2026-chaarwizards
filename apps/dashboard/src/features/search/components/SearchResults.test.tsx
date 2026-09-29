import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderView } from '../../../test/render';
import { SearchResults } from './SearchResults';
import type { SearchResponse } from '../types';

const noop = () => undefined;

describe('SearchResults — loading / empty / error (all three states)', () => {
  it('renders the loading state', async () => {
    await renderView(<SearchResults status="pending" data={undefined} onOpenAsset={noop} />);
    expect(screen.getByTestId('async-loading')).toBeInTheDocument();
  });

  it('renders an explicit error state with a retry, never a blank screen', async () => {
    const onRetry = vi.fn();
    await renderView(
      <SearchResults
        status="error"
        data={undefined}
        error={new Error('boom')}
        onOpenAsset={noop}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTestId('async-error')).toHaveTextContent('boom');
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders the empty state when the result set is empty', async () => {
    const data: SearchResponse = { data: [] };
    await renderView(<SearchResults status="success" data={data} onOpenAsset={noop} />);
    expect(screen.getByTestId('async-empty')).toBeInTheDocument();
  });

  it('renders rows and the "showing X of Y" count on success', async () => {
    const data: SearchResponse = {
      data: [
        {
          id: 'a1',
          project_id: 'p1',
          cloudinary_public_id: 'org/p1/sha',
          asset_type: 'image',
          device_capture_timestamp: '2024-01-15T09:30:00Z',
          gps_point: null,
          gps_accuracy_meters: null,
          gps_provider: null,
          caption: 'Planted 50',
          ai_tags: [],
          observation_type: 'planting',
          phase: 'before',
          upload_status: 'verified',
        },
      ],
      total_matched: 1,
    };
    await renderView(<SearchResults status="success" data={data} onOpenAsset={noop} />);
    expect(screen.getByTestId('result-count')).toHaveTextContent('Showing 1 of 1');
    expect(screen.getAllByTestId('result-row')).toHaveLength(1);
  });
});
