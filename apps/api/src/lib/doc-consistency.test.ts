import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseDocTables,
  parseDocEndpoints,
  normalizePath,
  findMissingTables,
  findMissingColumns,
  findUndocumentedEndpoints,
} from './doc-consistency.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const schemaDoc = readFileSync(
  join(repoRoot, 'docs', 'architecture', 'DATABASE_SCHEMA.md'),
  'utf8',
);
const apiContracts = readFileSync(
  join(repoRoot, 'docs', 'architecture', 'api-contracts.md'),
  'utf8',
);

const EXPECTED_TABLES = [
  'orgs',
  'invite_tokens',
  'projects',
  'assets',
  'asset_derivatives',
  'observations',
  'change_events',
  'evidence_packages',
  'report_manifest_entries',
  'audit_logs',
  'report_templates',
  'model_registry',
  'sync_state',
];

describe('parseDocTables', () => {
  const docTables = parseDocTables(schemaDoc);

  it('extracts every documented core table', () => {
    const names = docTables.map((t) => t.table);
    for (const expected of EXPECTED_TABLES) {
      expect(names, `table ${expected} should be parsed from DATABASE_SCHEMA.md`).toContain(
        expected,
      );
    }
  });

  it('extracts columns without swallowing constraints or comments', () => {
    const assets = docTables.find((t) => t.table === 'assets');
    expect(assets).toBeDefined();
    expect(assets!.columns).toContain('sha256_hash');
    expect(assets!.columns).toContain('device_capture_timestamp');
    expect(assets!.columns).toContain('gps_point');
    // Constraint keywords must never be mistaken for a column.
    expect(assets!.columns).not.toContain('primary');
    expect(assets!.columns).not.toContain('check');
    expect(assets!.columns).not.toContain('foreign');
  });
});

describe('findMissingTables — the migration gate must be seen to fail', () => {
  it('passes when the live catalog contains every documented table', () => {
    const docTables = EXPECTED_TABLES.map((table) => ({ table, columns: [] }));
    const actual = new Set(EXPECTED_TABLES);
    expect(findMissingTables(docTables, actual)).toEqual([]);
  });

  it('CATCHES a deliberately unreferenced missing table (§7.1 loophole closed)', () => {
    const docTables = [
      { table: 'orgs', columns: [] },
      { table: 'a_table_the_migrations_never_created', columns: [] },
    ];
    const actual = new Set(['orgs']); // the ghost table is absent from the DB
    const missing = findMissingTables(docTables, actual);
    expect(missing).toEqual(['a_table_the_migrations_never_created']);
  });
});

describe('findMissingColumns', () => {
  it('catches a documented column that the live table does not have', () => {
    const docTables = [{ table: 'orgs', columns: ['id', 'name', 'a_ghost_column'] }];
    const actual = new Map([['orgs', new Set(['id', 'name'])]]);
    expect(findMissingColumns(docTables, actual)).toEqual([
      { table: 'orgs', column: 'a_ghost_column' },
    ]);
  });

  it('does not double-report the columns of an entirely missing table', () => {
    const docTables = [{ table: 'ghost', columns: ['a', 'b'] }];
    const actual = new Map<string, Set<string>>(); // ghost not present
    expect(findMissingColumns(docTables, actual)).toEqual([]);
  });
});

describe('parseDocEndpoints + findUndocumentedEndpoints', () => {
  const endpoints = parseDocEndpoints(apiContracts);

  it('normalizes path params (name-agnostic) and strips query strings', () => {
    expect(normalizePath('/v1/assets/{asset_id}/integrity')).toBe('/v1/assets/:param/integrity');
    // A documented {project_id} and a route :id collapse to the same token.
    expect(normalizePath('/v1/projects/{project_id}')).toBe(normalizePath('/v1/projects/:id'));
    expect(normalizePath('/v1/search?bbox=1,2,3')).toBe('/v1/search');
    expect(normalizePath('/v1/pairs                     # member+')).toBe('/v1/pairs');
  });

  it('parses the documented Node API surface', () => {
    const keys = endpoints.map((e) => `${e.method} ${e.path}`);
    expect(keys).toContain('POST /v1/reports/generate');
    expect(keys).toContain('GET /v1/assets/:param/verify-chain');
    expect(keys).toContain('POST /webhooks/cloudinary');
  });

  it('CATCHES a documented endpoint that is registered nowhere', () => {
    const docEndpoints = [
      { method: 'GET', path: '/v1/projects' },
      { method: 'GET', path: '/v1/this/route/does/not/exist' },
    ];
    const actual = new Set(['GET /v1/projects']);
    expect(findUndocumentedEndpoints(docEndpoints, actual)).toEqual([
      { method: 'GET', path: '/v1/this/route/does/not/exist' },
    ]);
  });
});
