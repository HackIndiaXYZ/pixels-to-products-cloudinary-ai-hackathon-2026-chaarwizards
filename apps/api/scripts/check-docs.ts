/**
 * Doc↔reality gate CLI (Phase).
 *
 * Two checks, both direction doc → reality:
 *   1. Endpoints — every `METHOD /path` in api-contracts.md is registered by the
 *      Node API (routes/**) or the ML service (ml-service/src/app.py). Static; no
 *      database required. Always runs.
 *   2. Schema — every table and column in DATABASE_SCHEMA.md exists in
 *      information_schema after `supabase db reset`. Requires a reachable
 *      Postgres; connection string from DATABASE_URL, else the local Supabase
 *      default. Skipped with a clear notice (non-fatal) only when
 *      `--endpoints-only` is passed; otherwise an unreachable DB is a failure so
 *      the gate is never silently a no-op.
 *
 * Exit code is non-zero on any drift, so CI fails the build. The pure parsing and
 * diffing live in `src/lib/doc-consistency.ts` and are unit-tested there,
 * including the negative "catches a missing table" case .
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client } from 'pg';
import {
  parseDocTables,
  parseDocEndpoints,
  normalizePath,
  findMissingTables,
  findMissingColumns,
  findUndocumentedEndpoints,
  type DocTable,
} from '../src/lib/doc-consistency.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

function readDoc(...segments: string[]): string {
  return readFileSync(join(repoRoot, ...segments), 'utf8');
}

/** Recursively collect `.ts` route files, excluding tests. */
function collectRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectRouteFiles(full));
    } else if (entry.endsWith('.ts') && !entry.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

/** Registered Node API paths, e.g. `POST /v1/pairs`. `\s*` spans newlines. */
function collectNodeRoutes(): Set<string> {
  const routesDir = join(repoRoot, 'apps', 'api', 'src', 'routes');
  const paths = new Set<string>();
  const re = /\.(get|post|patch|put|delete)\(\s*'([^']+)'/g;
  for (const file of collectRouteFiles(routesDir)) {
    const src = readFileSync(file, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      paths.add(`${m[1]!.toUpperCase()} ${normalizePath(m[2]!)}`);
    }
  }
  // The webhook is registered inside a nested plugin scope with a leading
  // `/webhooks/cloudinary`; the regex above already captures it.
  return paths;
}

/** Registered ML FastAPI paths, e.g. `POST /v1/detect-change`. */
function collectMlRoutes(): Set<string> {
  const appPy = join(repoRoot, 'apps', 'ml-service', 'src', 'app.py');
  const paths = new Set<string>();
  const src = readFileSync(appPy, 'utf8');
  const re = /@app\.(get|post|patch|put|delete)\(\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    paths.add(`${m[1]!.toUpperCase()} ${normalizePath(m[2]!)}`);
  }
  return paths;
}

function checkEndpoints(): string[] {
  const failures: string[] = [];
  const contracts = readDoc('docs', 'architecture', 'api-contracts.md');
  const documented = parseDocEndpoints(contracts);
  const registered = new Set<string>([...collectNodeRoutes(), ...collectMlRoutes()]);
  const undocumented = findUndocumentedEndpoints(documented, registered);
  for (const e of undocumented) {
    failures.push(`api-contracts.md documents ${e.method} ${e.path}, but no route is registered`);
  }
  console.log(
    `endpoints: ${documented.length} documented, ${registered.size} registered, ${undocumented.length} missing`,
  );
  return failures;
}

async function checkSchema(): Promise<string[]> {
  const failures: string[] = [];
  const schemaDoc = readDoc('docs', 'architecture', 'DATABASE_SCHEMA.md');
  const docTables: DocTable[] = parseDocTables(schemaDoc);

  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'`,
    );
    const actualTables = new Set<string>();
    const actualColumns = new Map<string, Set<string>>();
    for (const row of res.rows) {
      actualTables.add(row.table_name);
      let cols = actualColumns.get(row.table_name);
      if (cols === undefined) {
        cols = new Set<string>();
        actualColumns.set(row.table_name, cols);
      }
      cols.add(row.column_name);
    }

    for (const table of findMissingTables(docTables, actualTables)) {
      failures.push(`DATABASE_SCHEMA.md names table "${table}" that is absent from information_schema`);
    }
    for (const { table, column } of findMissingColumns(docTables, actualColumns)) {
      failures.push(
        `DATABASE_SCHEMA.md names column "${table}.${column}" that is absent from information_schema`,
      );
    }
    console.log(
      `schema: ${docTables.length} documented tables, ${actualTables.size} live tables checked`,
    );
  } finally {
    await client.end();
  }
  return failures;
}

async function main(): Promise<void> {
  const endpointsOnly = process.argv.includes('--endpoints-only');
  const failures: string[] = [];

  failures.push(...checkEndpoints());

  if (endpointsOnly) {
    console.log('schema: skipped (--endpoints-only)');
  } else {
    try {
      failures.push(...(await checkSchema()));
    } catch (err) {
      failures.push(
        `schema check could not reach the database (${(err as Error).message}). ` +
          'Run `supabase db reset` first, or pass --endpoints-only to skip.',
      );
    }
  }

  if (failures.length > 0) {
    console.error(`\nDOC CONSISTENCY FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('\nDOC CONSISTENCY OK — docs name only tables/columns/endpoints that exist.');
}

main().catch((err) => {
  console.error('check-docs crashed', err);
  process.exit(1);
});
