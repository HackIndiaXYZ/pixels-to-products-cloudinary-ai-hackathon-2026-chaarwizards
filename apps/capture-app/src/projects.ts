/**
 * Project picker (BUILD_ORDER Phase 4 "Project picker").
 *
 * The capture screen shows a hierarchical project list. A field worker picks a
 * (sub-)project, an observation type, and a capture phase (`before`/`after`).
 * Sub-projects inherit their parent's `observation_types` when they define none
 * of their own, so a deep site tree does not force every leaf to re-declare the
 * same config — the gate proves inheritance across a two-level hierarchy.
 */
import { ASSET_PHASES } from '@impact/shared/rn';
import type { AssetPhase, ObservationTypeConfig, Project } from '@impact/shared/rn';

/** A project plus its resolved children, for rendering the picker tree. */
export interface ProjectNode {
  readonly project: Project;
  readonly children: readonly ProjectNode[];
}

/** The phases a capture may be tagged with. */
export const PHASE_OPTIONS: readonly AssetPhase[] = ASSET_PHASES;

/**
 * Build a forest from a flat project list using `parent_project_id`. Children are
 * ordered by name for a stable UI. A project whose parent is absent from the list
 * is treated as a root (the parent is simply out of scope for this org view).
 */
export function buildProjectTree(projects: readonly Project[]): readonly ProjectNode[] {
  const childrenByParent = new Map<string | null, Project[]>();
  const ids = new Set(projects.map((p) => p.id));
  for (const project of projects) {
    const rawParent = project.parent_project_id ?? null;
    const parentKey = rawParent !== null && ids.has(rawParent) ? rawParent : null;
    const bucket = childrenByParent.get(parentKey);
    if (bucket) bucket.push(project);
    else childrenByParent.set(parentKey, [project]);
  }

  const build = (parentKey: string | null): ProjectNode[] => {
    const bucket = childrenByParent.get(parentKey) ?? [];
    return [...bucket]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((project) => ({ project, children: build(project.id) }));
  };

  return build(null);
}

function parentChain(projects: readonly Project[], projectId: string): Project[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const chain: Project[] = [];
  let current = byId.get(projectId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    const parentId = current.parent_project_id ?? null;
    current = parentId !== null ? byId.get(parentId) : undefined;
  }
  return chain;
}

/**
 * Resolve the observation types available for `projectId`: the project's own
 * `config.observation_types` if non-empty, otherwise the nearest ancestor that
 * declares any. Returns `[]` when neither the project nor any ancestor defines a
 * type (nothing to capture — the picker disables observation selection).
 */
export function resolveObservationTypes(
  projects: readonly Project[],
  projectId: string,
): readonly ObservationTypeConfig[] {
  for (const project of parentChain(projects, projectId)) {
    const own = project.config.observation_types;
    if (own.length > 0) return own;
  }
  return [];
}

/** A completed picker selection, ready to seed a capture. */
export interface CaptureSelection {
  readonly projectId: string;
  readonly observationType: string;
  readonly phase: AssetPhase;
}

/**
 * Validate a picker selection against resolved config: the project must exist,
 * the observation type must be one the project (or an ancestor) offers, and the
 * phase must be a known phase. Returns the reason on failure rather than throwing
 * so the UI can surface it (AGENTS.md §3.6).
 */
export function validateSelection(
  projects: readonly Project[],
  selection: CaptureSelection,
): { ok: true } | { ok: false; reason: string } {
  const exists = projects.some((p) => p.id === selection.projectId);
  if (!exists) return { ok: false, reason: `unknown project ${selection.projectId}` };

  const types = resolveObservationTypes(projects, selection.projectId);
  if (!types.some((t) => t.type === selection.observationType)) {
    return {
      ok: false,
      reason: `observation type '${selection.observationType}' is not available for this project`,
    };
  }

  if (!PHASE_OPTIONS.includes(selection.phase)) {
    return { ok: false, reason: `invalid phase '${selection.phase}'` };
  }

  return { ok: true };
}
