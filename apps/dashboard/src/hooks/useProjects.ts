import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listProjects } from '../lib/queries/projects';
import type { Project } from '../types/database';
import type { DataState } from '../lib/state';
import { toDataState } from './useDataState';

export interface ProjectSelection {
  projects: Project[];
  state: DataState<Project[]>;
  projectId: string | null;
  setProjectId: (projectId: string | null) => void;
  /** The selected row, or null when the selection does not resolve. */
  project: Project | null;
}

/** The project read on its own, for surfaces that show projects without switching between them —
 *  the overview map, for instance. It shares the shell switcher's `['projects']` cache entry, so the
 *  switcher options and the map's waypoints come from one request. */
export function useProjectsState(): DataState<Project[]> {
  const query = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 120_000,
  });
  return toDataState(query);
}

/** Project selection is UI-local state. `search_assets` has no project parameter, so the evidence
 *  explorer never pretends to filter by project on the server; only queries that genuinely accept a
 *  project id use this selection. */
export function useProjects(): ProjectSelection {
  const [projectId, setProjectId] = useState<string | null>(null);
  const state = useProjectsState();
  const projects = state.status === 'ready' ? state.data : [];
  const project = useMemo(
    () => projects.find((entry) => entry.id === projectId) ?? null,
    [projects, projectId],
  );
  return { projects, state, projectId, setProjectId, project };
}