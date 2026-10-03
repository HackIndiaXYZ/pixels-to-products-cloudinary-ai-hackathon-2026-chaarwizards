import { useQuery } from '@tanstack/react-query';
import {
  getVerificationReceipt,
  listEvidencePackages,
  listManifestEntries,
  listReportTemplates,
} from '../lib/queries/reports';
import { listProjects, getProject } from '../lib/queries/projects';
import { listVerifiedAssets } from '../lib/queries/quarantine';
import { toManifestRowModel, type ManifestRowModel } from '../lib/models';
import type { Asset, EvidencePackage, Project, ReportTemplate, VerificationReceipt } from '../types/database';
import { ready, type DataState } from '../lib/state';
import { toDataState } from './useDataState';

export interface ReportWorkspace {
  projects: Project[];
  templates: DataState<ReportTemplate[]>;
  packages: DataState<EvidencePackage[]>;
  selectableAssets: DataState<Asset[]>;
}

async function loadWorkspace(projectId: string | null): Promise<DataState<ReportWorkspace>> {
  const projects = await listProjects();
  const templates = await listReportTemplates();
  const packages = await listEvidencePackages(projectId);
  const scoped = projectId ?? (projects.status === 'ready' ? projects.data[0]?.id ?? null : null);
  const selectableAssets = scoped === null ? null : await listVerifiedAssets(scoped, 100);
  return ready<ReportWorkspace>({
    projects: projects.status === 'ready' ? projects.data : [],
    templates,
    packages,
    /* Quarantined assets are excluded server-side from any verified evidence selection. */
    selectableAssets:
      selectableAssets === null
        ? { status: 'empty', reason: 'No projects found.' }
        : selectableAssets,
  });
}

export function useReports(projectId: string | null): DataState<ReportWorkspace> {
  const query = useQuery({
    queryKey: ['reports', projectId],
    queryFn: () => loadWorkspace(projectId),
    staleTime: 30_000,
  });
  return toDataState(query);
}

export interface ManifestBundle {
  packageRow: EvidencePackage;
  rows: ManifestRowModel[];
  receipt: DataState<VerificationReceipt>;
}

async function loadManifest(packageId: string): Promise<DataState<ManifestBundle>> {
  const packages = await listEvidencePackages(null);
  if (packages.status !== 'ready') return packages;
  const packageRow = packages.data.find((entry) => entry.id === packageId);
  if (packageRow === undefined) return { status: 'unknown' };
  const entries = await listManifestEntries(packageId);
  const receipt = await getVerificationReceipt(packageId);
  return ready<ManifestBundle>({
    packageRow,
    rows: entries.status === 'ready' ? entries.data.map(toManifestRowModel) : [],
    receipt,
  });
}

export function useReportManifest(packageId: string | null): DataState<ManifestBundle> {
  const query = useQuery({
    queryKey: ['reports', 'manifest', packageId],
    queryFn: () => loadManifest(packageId as string),
    enabled: packageId !== null,
    staleTime: 30_000,
  });
  return toDataState(query);
}

export async function loadProjectDetail(projectId: string): Promise<DataState<Project>> {
  return getProject(projectId);
}
