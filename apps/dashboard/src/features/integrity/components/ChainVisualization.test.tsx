import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderView } from '../../../test/render';
import { ChainVisualization } from './ChainVisualization';
import type { ChainVerification } from '../api';

const ok: ChainVerification = {
  asset_id: 'a1',
  ok: true,
  checked: 3,
  first_id: 1,
  last_id: 3,
  tip_hash: 'deadbeef',
  failure: null,
};

describe('ChainVisualization', () => {
  it('shows a pass verdict and the tip hash for an intact chain', async () => {
    await renderView(<ChainVisualization chain={ok} />);
    expect(screen.getByTestId('chain-verdict').getAttribute('data-verdict')).toBe('pass');
    expect(screen.getByTestId('chain-tip').textContent).toContain('deadbeef');
    expect(screen.queryByTestId('chain-failure')).toBeNull();
  });

  it('NAMES the failing row when a value was tampered', async () => {
    const tampered: ChainVerification = {
      ...ok,
      ok: false,
      failure: { audit_id: 42, kind: 'hash_mismatch', reason: 'row 42 content does not reproduce' },
    };
    await renderView(<ChainVisualization chain={tampered} />);
    expect(screen.getByTestId('chain-verdict').getAttribute('data-verdict')).toBe('fail');
    const failure = screen.getByTestId('chain-failure');
    expect(failure.getAttribute('data-failure-kind')).toBe('hash_mismatch');
    expect(failure.textContent).toContain('42');
  });

  it('names a gap (broken_link) from a deleted intermediate row', async () => {
    const gap: ChainVerification = {
      ...ok,
      ok: false,
      failure: { audit_id: 3, kind: 'broken_link', reason: 'a prior row was deleted' },
    };
    await renderView(<ChainVisualization chain={gap} />);
    expect(screen.getByTestId('chain-failure').getAttribute('data-failure-kind')).toBe('broken_link');
  });
});
