import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { Project } from '@panchnama/shared/rn';
import { renderView } from '../../../test/render';
import { buildProjectTree } from '../api';
import { ProjectTree } from './ProjectTree';

function project(id: string, name: string, parent: string | null, obsTypes: string[]): Project {
  return {
    id,
    org_id: 'org-1',
    name,
    sector: 'forestry',
    config: {
      observation_types: obsTypes.map((t) => ({ type: t, model: 'forestry', gps_radius: 25 })),
    },
    parent_project_id: parent,
    created_at: '2024-01-01T00:00:00Z',
  };
}

const flat: Project[] = [
  project('root', 'Mangrove Programme', null, ['planting']),
  project('child', 'Mangrove Phase 2', 'root', ['survival']),
];

describe('buildProjectTree', () => {
  it('nests a child under its parent', () => {
    const tree = buildProjectTree(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.project.id).toBe('root');
    expect(tree[0]?.children[0]?.project.id).toBe('child');
  });
});

describe('ProjectTree', () => {
  it('renders a two-level hierarchy with observation-type badges', async () => {
    const tree = buildProjectTree(flat);
    await renderView(<ProjectTree nodes={tree} onSelect={vi.fn()} />);

    expect(screen.getByText('Mangrove Programme')).toBeInTheDocument();
    expect(screen.getByText('Mangrove Phase 2')).toBeInTheDocument();

    const badges = screen.getAllByTestId('observation-badge').map((b) => b.textContent);
    expect(badges).toContain('planting');
    expect(badges).toContain('survival');
  });

  it('calls onSelect with the clicked project', async () => {
    const onSelect = vi.fn();
    await renderView(<ProjectTree nodes={buildProjectTree(flat)} onSelect={onSelect} />);
    screen.getByText('Mangrove Phase 2').click();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'child' }));
  });
});
