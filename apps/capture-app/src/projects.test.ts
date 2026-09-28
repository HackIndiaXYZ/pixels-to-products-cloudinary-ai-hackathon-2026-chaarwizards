import { describe, expect, it } from 'vitest';
import type { Project } from '@impact/shared/rn';
import {
  buildProjectTree,
  resolveObservationTypes,
  validateSelection,
} from './projects.js';

const ORG = '00000000-0000-0000-0000-000000000001';
const ROOT = '10000000-0000-0000-0000-000000000000';
const CHILD = '20000000-0000-0000-0000-000000000000';
const SIBLING = '30000000-0000-0000-0000-000000000000';

const project = (over: Partial<Project> & Pick<Project, 'id' | 'name'>): Project => ({
  org_id: ORG,
  config: { observation_types: [] },
  created_at: '2024-01-01T00:00:00.000Z',
  parent_project_id: null,
  ...over,
});

const PROJECTS: Project[] = [
  project({
    id: ROOT,
    name: 'Watershed Programme',
    config: {
      observation_types: [
        { type: 'planting', model: 'tree-count@1', gps_radius: 25 },
        { type: 'wells', model: 'well-detect@1', gps_radius: 15 },
      ],
    },
  }),
  // Sub-project with NO observation types of its own — must inherit from ROOT.
  project({ id: CHILD, name: 'North Sub-site', parent_project_id: ROOT }),
  // Sibling that overrides with its own type.
  project({
    id: SIBLING,
    name: 'South Sub-site',
    parent_project_id: ROOT,
    config: { observation_types: [{ type: 'fencing', model: 'fence@1', gps_radius: 5 }] },
  }),
];

describe('buildProjectTree', () => {
  it('nests sub-projects under their parent, sorted by name', () => {
    const tree = buildProjectTree(PROJECTS);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.project.id).toBe(ROOT);
    const childIds = tree[0]?.children.map((c) => c.project.id);
    expect(childIds).toEqual([CHILD, SIBLING]); // North before South
  });
});

describe('resolveObservationTypes (two-level inheritance)', () => {
  it('inherits the parent observation types for a sub-project with none', () => {
    const types = resolveObservationTypes(PROJECTS, CHILD);
    expect(types.map((t) => t.type)).toEqual(['planting', 'wells']);
  });

  it('uses the sub-project own types when it defines them', () => {
    const types = resolveObservationTypes(PROJECTS, SIBLING);
    expect(types.map((t) => t.type)).toEqual(['fencing']);
  });

  it('returns the root own types for the root', () => {
    expect(resolveObservationTypes(PROJECTS, ROOT).map((t) => t.type)).toEqual([
      'planting',
      'wells',
    ]);
  });
});

describe('validateSelection', () => {
  it('accepts an inherited observation type with a valid phase', () => {
    const r = validateSelection(PROJECTS, {
      projectId: CHILD,
      observationType: 'planting',
      phase: 'before',
    });
    expect(r).toEqual({ ok: true });
  });

  it('rejects an observation type not offered by the project or its ancestors', () => {
    const r = validateSelection(PROJECTS, {
      projectId: CHILD,
      observationType: 'fencing',
      phase: 'before',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects an unknown project', () => {
    const r = validateSelection(PROJECTS, {
      projectId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      observationType: 'planting',
      phase: 'after',
    });
    expect(r.ok).toBe(false);
  });
});
