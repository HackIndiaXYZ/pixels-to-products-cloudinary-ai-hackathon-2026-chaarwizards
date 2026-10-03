import type {
  EvidencePackage,
  ReportManifestEntry,
  ReportTemplate,
  VerificationReceipt,
} from '../../types/database';
import { failed, ready, readyOrEmpty, undetermined, type DataState } from '../state';
import { rpc, table } from '../supabase/client';
import {
  asArray,
  asRecord,
  parseEvidencePackages,
  parseManifestEntries,
  parseVerificationReceipt,
  requiredStr,
} from './parse';

export async function listEvidencePackages(projectId: string | null): Promise<DataState<EvidencePackage[]>> {
  const packages = table('evidence_packages');
  if (packages === null) return failed();
  let query = packages.select('*').order('generated_at', false).limit(100);
  if (projectId !== null) query = query.eq('project_id', projectId);
  const envelope = await query;
  if (envelope.error) return failed();
  return readyOrEmpty(parseEvidencePackages(envelope.data));
}

/** `report_templates` ships with no seed rows, so in a fresh environment this resolves to the
 *  empty state and the picker renders `No report templates available.` That is the correct
 *  expected state, not a defect to paper over with a placeholder template. */
export async function listReportTemplates(): Promise<DataState<ReportTemplate[]>> {
  const templates = table('report_templates');
  if (templates === null) return failed();
  const envelope = await templates.select('*').limit(100);
  if (envelope.error) return failed();
  const rows = asArray(envelope.data)
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => row !== null)
    .filter((row) => requiredStr(row.id) !== null)
    .map((row) => row as unknown as ReportTemplate);
  return readyOrEmpty(rows);
}

export async function listManifestEntries(
  evidencePackageId: string,
): Promise<DataState<ReportManifestEntry[]>> {
  const manifest = table('report_manifest_entries');
  if (manifest === null) return failed();
  const envelope = await manifest
    .select('*')
    .eq('evidence_package_id', evidencePackageId)
    .order('ordinal', true);
  if (envelope.error) return failed();
  return readyOrEmpty(parseManifestEntries(envelope.data));
}

/** A real re-verification of the package against Postgres, referenced by ordinal index only —
 *  never by asset id, caption, or GPS. */
export async function getVerificationReceipt(
  evidencePackageId: string,
): Promise<DataState<VerificationReceipt>> {
  const envelope = await rpc('report_verification_receipt', { p_report_id: evidencePackageId });
  if (envelope.error) return failed();
  const parsed = parseVerificationReceipt(envelope.data);
  return parsed === null ? undetermined() : ready(parsed);
}
