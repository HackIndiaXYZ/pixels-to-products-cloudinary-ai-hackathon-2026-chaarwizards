import { useQuery } from '@tanstack/react-query';
import {
  getChangeEventAssets,
  listChangeEvents,
  listModelRegistry,
  registryForSector,
} from '../lib/queries/changes';
import { resolveAssetMedia } from '../lib/queries/evidence';
import { listProjects } from '../lib/queries/projects';
import { toChangeMetricRows, toModelProvenance, type ChangeDetailModel } from '../lib/models';
import type { Asset, ChangeEvent, ModelRegistryEntry, Project } from '../types/database';
import { isPairedChangeEvent } from '../types/database';
import { empty, ready, type DataState } from '../lib/state';
import { toDataState } from './useDataState';

export interface ChangeFeed {
  events: ChangeEvent[];
  projects: Project[];
  registry: ModelRegistryEntry[];
}

async function loadFeed(projectId: string | null): Promise<DataState<ChangeFeed>> {
  const events = await listChangeEvents(projectId, 50);
  const projects = await listProjects();
  const registry = await listModelRegistry();
  if (events.status !== 'ready') return events;
  return ready<ChangeFeed>({
    events: events.data,
    projects: projects.status === 'ready' ? projects.data : [],
    registry: registry.status === 'ready' ? registry.data : [],
  });
}

export function useChangeEvents(projectId: string | null): DataState<ChangeFeed> {
  const query = useQuery({
    queryKey: ['change-events', projectId],
    queryFn: () => loadFeed(projectId),
    staleTime: 30_000,
  });
  return toDataState(query);
}

async function loadDetail(
  event: ChangeEvent,
  registry: ModelRegistryEntry[],
  projects: Project[],
): Promise<DataState<ChangeDetailModel>> {
  const [pair, beforeMedia, afterMedia] = await Promise.all([
    getChangeEventAssets(event),
    event.before_asset_id === null ? Promise.resolve(null) : resolveAssetMedia(event.before_asset_id),
    event.after_asset_id === null ? Promise.resolve(null) : resolveAssetMedia(event.after_asset_id),
  ]);
  if (pair.status !== 'ready') return pair;
  const [before, after] = pair.data;
  const project = projects.find((entry) => entry.id === event.project_id) ?? null;
  return ready<ChangeDetailModel>({
    event,
    paired: isPairedChangeEvent(event),
    before,
    after,
    beforeMedia,
    afterMedia,
    /* The diff mask is a column on the row the client already read under RLS, so the public id is
       resolved server-side rather than supplied by the request. It is absent for most events. */
    diffPublicId:
      event.diff_asset_cloudinary_id === null
        ? { state: 'unavailable' }
        : { state: 'value', value: event.diff_asset_cloudinary_id },
    metricRows: toChangeMetricRows(event.change_metrics),
    provenance: toModelProvenance(event, project?.sector ?? null, registryForSector(registry, project?.sector ?? null)),
  });
}

export function useChangeDetail(
  event: ChangeEvent | null,
  registry: ModelRegistryEntry[],
  projects: Project[],
): DataState<ChangeDetailModel> {
  const query = useQuery({
    queryKey: ['change-detail', event?.id ?? null],
    queryFn: () => loadDetail(event as ChangeEvent, registry, projects),
    enabled: event !== null,
    staleTime: 30_000,
  });
  if (event === null) return empty();
  return toDataState(query);
}

export function projectOptions(projects: Project[]): Project[] {
  return projects;
}

export function assetLabel(asset: Asset | null): string {
  return asset === null ? 'Unknown' : asset.observation_type ?? asset.id;
}
