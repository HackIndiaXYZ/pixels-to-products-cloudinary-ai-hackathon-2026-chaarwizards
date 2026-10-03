/**
 * Nightly reconciliation entrypoint (Phase). Wires the real
 * Supabase DB and the Cloudinary Admin adapter, runs the one-way integrity check
 * (§3.9), recomputes `orgs.bytes_used`, and prints a report. Intended to be run
 * on a schedule (cron / a BullMQ repeatable job), never in a request path.
 */
import { loadConfig } from '../config.js';
import { createSupabaseDb } from '../plugins/supabase.js';
import { createCloudinaryAdmin } from '../plugins/cloudinary-admin.js';
import { reconcile } from '../services/reconciliation.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createSupabaseDb(config);
  const admin = createCloudinaryAdmin(config);

  const report = await reconcile({ db, admin });
  // Structured, greppable output for the operator log.
  console.log(
    JSON.stringify({
      msg: 'reconciliation_complete',
      checked_resources: report.checkedResources,
      known_public_ids: report.knownPublicIds,
      orphans: report.orphans.length,
      missing: report.missing.length,
      orgs_recomputed: Object.keys(report.bytesUsedByOrg).length,
    }),
  );
  if (report.orphans.length > 0) {
    console.warn(JSON.stringify({ msg: 'orphans_found', public_ids: report.orphans }));
  }
  if (report.missing.length > 0) {
    console.error(JSON.stringify({ msg: 'missing_assets', public_ids: report.missing }));
  }
}

main().catch((err) => {
  console.error('reconciliation failed', err);
  process.exit(1);
});
