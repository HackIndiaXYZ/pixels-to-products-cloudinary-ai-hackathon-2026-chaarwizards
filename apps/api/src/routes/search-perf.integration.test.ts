/**
 * MVP exit criterion 3 (BUILD_ORDER Phase 11 / MVP_EXIT_CRITERIA.md #3):
 * "Search 1 000 assets by tag, location, date, GPS accuracy, or asset type in
 * under 500 ms."
 *
 * This is the automated, repeatable half of the criterion. It seeds a 1 000-row
 * asset set in a transaction and runs `EXPLAIN (ANALYZE, FORMAT JSON)` on every
 * filter path that `search_assets` exposes (tag / location / date / GPS accuracy
 * / asset type), then ROLLs BACK so the database is untouched.
 *
 * Two things are checked per path:
 *   1. INDEX USABILITY — a hard pass/fail. With `enable_seqscan = off` the
 *      planner must choose an Index / Bitmap Index Scan on the path's index, not
 *      a sequential scan. On a 1 000-row table Postgres legitimately PREFERS a
 *      seq scan (the table fits in a handful of pages), so disabling seqscan is
 *      how we prove the index EXISTS and COVERS the path — the property that
 *      actually matters as the table grows to millions of rows.
 *   2. WALL-CLOCK — captured and logged, but NOT asserted. The number is
 *      developer-hardware and is only meaningful on staging (see the note the
 *      test prints). Staging confirmation of the <500 ms budget remains a
 *      user-review item in MVP_EXIT_MANUAL_CHECKLIST.md.
 *
 * Requires a reachable Postgres (local Supabase on :54322, or DATABASE_URL). When
 * none is reachable the suite is SKIPPED (reported BLOCKED — needs a DB), never a
 * false pass.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

const CONNECTION_STRING =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function probe(): Promise<boolean> {
  const c = new Client({ connectionString: CONNECTION_STRING, connectionTimeoutMillis: 2000 });
  try {
    await c.connect();
    await c.query('SELECT 1');
    await c.end();
    return true;
  } catch {
    try {
      await c.end();
    } catch {
      /* ignore */
    }
    return false;
  }
}

const dbReachable = await probe();
if (!dbReachable) {
  console.warn(
    'criterion 3 search bench SKIPPED — no Postgres reachable at DATABASE_URL / local :54322. ' +
      'Reported BLOCKED (needs a DB); run `supabase db start` to execute it.',
  );
}

interface PlanNode {
  'Node Type': string;
  'Index Name'?: string;
  'Actual Total Time'?: number;
  Plans?: PlanNode[];
}

/** Collect every node type in the plan tree. */
function nodeTypes(node: PlanNode, acc: string[] = []): string[] {
  acc.push(node['Node Type']);
  for (const child of node.Plans ?? []) nodeTypes(child, acc);
  return acc;
}

/** Every index name referenced anywhere in the plan tree. */
function indexNames(node: PlanNode, acc: string[] = []): string[] {
  if (node['Index Name'] !== undefined) acc.push(node['Index Name']);
  for (const child of node.Plans ?? []) indexNames(child, acc);
  return acc;
}

describe.skipIf(!dbReachable)('MVP criterion 3 — search 1 000 assets, every filter path is indexed', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: CONNECTION_STRING });
    await client.connect();
    await client.query('BEGIN');

    // Seed one org + project, then 1 000 assets with varied tag / gps / date /
    // accuracy / type. All inside the transaction we roll back in afterAll.
    const { rows: orgRows } = await client.query<{ id: string }>(
      `INSERT INTO orgs (name, type) VALUES ('bench-org', 'ngo') RETURNING id`,
    );
    const orgId = orgRows[0]!.id;
    const { rows: projRows } = await client.query<{ id: string }>(
      `INSERT INTO projects (org_id, name, sector) VALUES ($1, 'bench', 'forestry') RETURNING id`,
      [orgId],
    );
    const projectId = projRows[0]!.id;

    // Generate 1 000 rows server-side for speed. lon/lat spread across a box,
    // ai_tags a rotating set, device_capture_timestamp spread over 1 000 days,
    // gps accuracy 1..50 m, asset_type alternating image/video.
    await client.query(
      `INSERT INTO assets (
         project_id, org_id, cloudinary_public_id, asset_type,
         device_capture_timestamp, device_commit_hash, device_id, device_public_key,
         capture_signature, exif_hash, sha256_hash,
         gps_point, gps_accuracy_meters, ai_tags, observation_type, phase, upload_status
       )
       SELECT
         $1, $2,
         'bench/' || g::text,
         CASE WHEN g % 2 = 0 THEN 'image' ELSE 'video' END,
         timestamptz '2023-01-01 00:00:00Z' + (g || ' days')::interval,
         'commit-' || g, 'dev-' || g, 'pk-' || g, 'sig-' || g, 'exif-' || g, 'sha-' || g,
         ST_SetSRID(ST_MakePoint(72.8 + (g % 100) * 0.001, 19.0 + (g % 100) * 0.001), 4326)::geography,
         1 + (g % 50),
         to_jsonb(ARRAY['tag' || (g % 20)::text, 'sapling']),
         'planting',
         CASE WHEN g % 2 = 0 THEN 'before' ELSE 'after' END,
         'verified'
       FROM generate_series(1, 1000) AS g`,
      [projectId, orgId],
    );
    await client.query('ANALYZE assets');
  }, 60_000);

  afterAll(async () => {
    if (client !== undefined) {
      await client.query('ROLLBACK');
      await client.end();
    }
  });

  /**
   * Run EXPLAIN twice: once with seqscan disabled to prove the index covers the
   * path (hard assertion), once with the planner free to capture a realistic
   * wall-clock number (logged, not asserted).
   */
  async function planFor(
    label: string,
    where: string,
    params: unknown[],
    expectedIndex: string,
  ): Promise<void> {
    // 1. Force index applicability to be revealed.
    await client.query('SET LOCAL enable_seqscan = off');
    const forced = await client.query<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(
      `EXPLAIN (ANALYZE, FORMAT JSON) SELECT a.id FROM assets a WHERE ${where}`,
      params,
    );
    const plan = forced.rows[0]!['QUERY PLAN'][0].Plan;
    const types = nodeTypes(plan);
    const indexes = indexNames(plan);
    const usesIndex = types.some((t) => t.includes('Index Scan') || t === 'Bitmap Index Scan');

    // 2. Realistic wall-clock (planner free to choose).
    await client.query('SET LOCAL enable_seqscan = on');
    const free = await client.query<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(
      `EXPLAIN (ANALYZE, FORMAT JSON) SELECT a.id FROM assets a WHERE ${where}`,
      params,
    );
    const ms = free.rows[0]!['QUERY PLAN'][0].Plan['Actual Total Time'] ?? -1;

    console.log(
      `[criterion 3] ${label}: index=${usesIndex ? indexes.join(',') : 'NONE'} · ` +
        `wall-clock ${ms.toFixed(2)}ms (developer hardware — staging confirmation still required)`,
    );

    // HARD assertion: the path is index-assisted, not a sequential scan.
    expect(usesIndex, `${label} must use an index scan, got: ${types.join(' > ')}`).toBe(true);
    expect(indexes, `${label} should use ${expectedIndex}`).toContain(expectedIndex);
  }

  it('tag filter (ai_tags @> ...) uses the GIN index', async () => {
    await planFor('tag', `a.ai_tags @> to_jsonb($1::text[])`, [['tag3']], 'idx_assets_ai_tags');
  });

  it('location filter (ST_Intersects) uses the GIST index', async () => {
    await planFor(
      'location',
      `a.gps_point IS NOT NULL AND ST_Intersects(a.gps_point::geometry, ST_MakeEnvelope(72.80, 19.00, 72.85, 19.05, 4326))`,
      [],
      'idx_assets_gps',
    );
  });

  it('date filter (device_capture_timestamp range) uses the time index', async () => {
    await planFor(
      'date',
      `a.device_capture_timestamp >= $1 AND a.device_capture_timestamp <= $2`,
      ['2023-06-01T00:00:00Z', '2023-06-10T00:00:00Z'],
      'idx_assets_capture_time',
    );
  });

  it('GPS accuracy filter uses the partial accuracy index', async () => {
    await planFor(
      'gps_accuracy',
      `a.gps_accuracy_meters IS NOT NULL AND a.gps_accuracy_meters <= $1`,
      [5],
      'idx_assets_gps_accuracy',
    );
  });

  it('asset_type filter uses the asset_type index', async () => {
    await planFor('asset_type', `a.asset_type = $1`, ['video'], 'idx_assets_asset_type');
  });
});
