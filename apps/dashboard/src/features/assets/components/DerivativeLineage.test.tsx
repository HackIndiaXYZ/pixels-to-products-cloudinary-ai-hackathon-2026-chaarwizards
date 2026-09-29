import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { AssetDerivative } from '@impact/shared/rn';
import { renderView } from '../../../test/render';
import { DerivativeLineage } from './DerivativeLineage';

const derivatives: AssetDerivative[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    parent_asset_id: '22222222-2222-2222-2222-222222222222',
    org_id: '33333333-3333-3333-3333-333333333333',
    transformation: 'c_lfill,g_auto,w_400,h_300,f_auto,q_auto:eco',
    kind: 'report_thumb',
    public_id: 'org/proj/report_thumb/sha',
    is_generative: false,
    cloudinary_asset_id: null,
    cloudinary_version: null,
    byte_size: null,
    sha256_hash: null,
    created_at: '2024-01-15T10:00:00Z',
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    parent_asset_id: '22222222-2222-2222-2222-222222222222',
    org_id: '33333333-3333-3333-3333-333333333333',
    transformation: 'e_gen_background_replace',
    kind: 'report_social',
    public_id: 'org/proj/report_social/sha',
    is_generative: true,
    cloudinary_asset_id: null,
    cloudinary_version: null,
    byte_size: null,
    sha256_hash: null,
    created_at: '2024-01-15T10:05:00Z',
  },
];

describe('DerivativeLineage', () => {
  it('shows the original at the root and every derivative’s transformation string (§3.1)', async () => {
    await renderView(<DerivativeLineage originalPublicId="org/proj/sha" derivatives={derivatives} />);

    expect(screen.getByTestId('lineage-original')).toHaveTextContent('org/proj/sha');

    const strings = screen.getAllByTestId('lineage-transformation').map((n) => n.textContent);
    expect(strings).toContain('c_lfill,g_auto,w_400,h_300,f_auto,q_auto:eco');
    expect(strings).toContain('e_gen_background_replace');
  });

  it('flags a generative derivative distinctly', async () => {
    await renderView(<DerivativeLineage originalPublicId="org/proj/sha" derivatives={derivatives} />);
    expect(screen.getAllByTestId('lineage-generative')).toHaveLength(1);
  });

  it('renders an explicit "original only" state when there are no derivatives', async () => {
    await renderView(<DerivativeLineage originalPublicId="org/proj/sha" derivatives={[]} />);
    expect(screen.getByTestId('lineage-empty')).toBeInTheDocument();
  });
});
