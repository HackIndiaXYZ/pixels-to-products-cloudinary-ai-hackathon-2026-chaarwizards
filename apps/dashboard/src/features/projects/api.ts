import type { Project } from '@panchnama/shared/rn';
import { apiRequest } from '../../shared/api/client';

export interface ProjectListResponse {
  readonly data: readonly Project[];
  readonly total?: number;
  readonly next_cursor?: string;
}

/** List projects visible to the caller (org-scoped by RLS via the JWT). */
export async function listProjects(page?: {
  readonly limit?: number;
  readonly cursor?: string;
}): Promise<ProjectListResponse> {
  return apiRequest<ProjectListResponse>('/v1/projects', {
    query: { limit: page?.limit, cursor: page?.cursor },
  });
}

/** A project plus its resolved children, for the hierarchical picker. */
export interface ProjectTreeNode {
  readonly project: Project;
  readonly children: readonly ProjectTreeNode[];
}

/**
 * Build the project hierarchy from a flat list using `parent_project_id`.
 * Pure so the picker can be tested against a fixture with a multi-level tree.
 * A node whose parent is not in the visible set surfaces at the root, so a
 * child is never hidden just because its parent was filtered out by RLS.
 */
export function buildProjectTree(projects: readonly Project[]): readonly ProjectTreeNode[] {
  const byId = new Map<string, Project>();
  for (const p of projects) {
    byId.set(p.id, p);
  }
  const childrenOf = new Map<string, Project[]>();
  const roots: Project[] = [];

  for (const p of projects) {
    const parentId = p.parent_project_id ?? null;
    if (parentId !== null && byId.has(parentId)) {
      const list = childrenOf.get(parentId) ?? [];
      list.push(p);
      childrenOf.set(parentId, list);
    } else {
      roots.push(p);
    }
  }

  const build = (project: Project): ProjectTreeNode => ({
    project,
    children: (childrenOf.get(project.id) ?? []).map(build),
  });

  return roots.map(build);
}
