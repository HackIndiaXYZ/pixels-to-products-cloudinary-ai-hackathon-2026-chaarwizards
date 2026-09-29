import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderView } from '../../../test/render';
import { MetricsTable } from './MetricsTable';

describe('MetricsTable', () => {
  it('shows the model version beside every metric (§3.2)', async () => {
    await renderView(
      <MetricsTable
        metrics={{ saplings_planted: 49, area_covered_sqm: 1200.5, before_count: 2 }}
        modelVersion="v1-placeholder"
        confidence={0.93}
      />,
    );

    const rows = screen.getAllByTestId('metric-row');
    expect(rows).toHaveLength(3);

    // Every metric row (and the confidence footer) carries the version.
    const versions = screen.getAllByTestId('metric-model-version');
    expect(versions.length).toBe(4); // 3 metrics + confidence
    for (const v of versions) {
      expect(v).toHaveTextContent('v1-placeholder');
    }
  });

  it('still names the model version when there are no metrics (manual pair)', async () => {
    await renderView(<MetricsTable metrics={{}} modelVersion="manual" />);
    expect(screen.getByTestId('metrics-empty')).toBeInTheDocument();
    expect(screen.getByTestId('metric-model-version')).toHaveTextContent('manual');
  });
});
