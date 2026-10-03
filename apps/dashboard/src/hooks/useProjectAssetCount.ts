import { useQuery } from '@tanstack/react-query';
import { countProjectAssets } from '../lib/queries/projects';
import { undetermined, type DataState } from '../lib/state';
import { toDataState } from './useDataState';

/** The asset total of the project whose waypoint is open. Only that one project is counted: an
 *  exact count per project for every tag on the map would spend one request per row to fill in
 *  numbers nobody has asked for yet. No selection reads `unknown`, not `0` — nothing was counted,
 *  which is different from a project that has no assets. */
export function useProjectAssetCount(projectId: string | null): DataState<number> {
  const query = useQuery({
    queryKey: ['projects', projectId, 'asset-count'],
    queryFn: () => countProjectAssets(projectId ?? ''),
    enabled: projectId !== null,
    staleTime: 60_000,
  });
  if (projectId === null) return undetermined<number>();
  return toDataState(query);
}