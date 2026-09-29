import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../shared/queryKeys';
import { buildProjectTree, listProjects, type ProjectTreeNode } from '../api';

/** Load the flat project list. */
export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects.all(),
    queryFn: () => listProjects({ limit: 100 }),
  });
}

/** Load projects and assemble the hierarchical tree for the picker. */
export function useProjectTree() {
  return useQuery({
    queryKey: queryKeys.projects.tree(),
    queryFn: async (): Promise<readonly ProjectTreeNode[]> => {
      const response = await listProjects({ limit: 100 });
      return buildProjectTree(response.data);
    },
  });
}
