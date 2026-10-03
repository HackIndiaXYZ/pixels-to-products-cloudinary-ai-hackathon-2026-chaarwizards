/**
 * Doc↔reality consistency checks (Phase gate:
 *  - "the migration gate actually fails" — every table and column named in
 *    DATABASE_SCHEMA.md must exist in information_schema after a reset, and the
 *    check must be *seen to fail* on a deliberately missing table;
 *  - "docs are asserted to match reality" — api-contracts.md must name only
 *    endpoints that exist.
 *
 * The parsing and the diff are pure so they are unit-testable WITHOUT a database
 * (the negative "catches a missing table" case is a unit test here). The live
 * catalog and the live route table are supplied by the CLI wrapper
 * (`scripts/check-docs.ts`), which reads information_schema over `pg` and scans
 * the route source. Keeping the comparison pure is what closes the §7.1 loophole
 * — a gate that has never been seen to fail is not a gate.
 */

/** A table and its column names, parsed from a `CREATE TABLE` block. */
export interface DocTable {
  readonly table: string;
  readonly columns: readonly string[];
}

/** An HTTP endpoint parsed from api-contracts.md, path params normalized to `:x`. */
export interface DocEndpoint {
  readonly method: string;
  /** Normalized path: `{asset_id}` → `:asset_id`, query string stripped. */
  readonly path: string;
}

/** SQL keywords that begin a table constraint line rather than a column. */
const CONSTRAINT_KEYWORDS = new Set([
  'primary',
  'foreign',
  'unique',
  'check',
  'constraint',
  'exclude',
  'like',
]);

/**
 * Parse every `CREATE TABLE <name> ( ... );` block into a table + its columns.
 * Column lines look like `  <ident> <TYPE> ...`; comment (`--`), blank, and
 * constraint lines (`PRIMARY KEY`, `FOREIGN KEY`, `CHECK`, ...) are skipped.
 */
export function parseDocTables(markdown: string): DocTable[] {
  const tables: DocTable[] = [];
  const createRe = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(?:public\.)?("?[a-z_][a-z0-9_]*"?)\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = createRe.exec(markdown)) !== null) {
    const table = match[1]!.replace(/"/g, '');
    // Walk from the opening paren to its matching close paren by depth.
    let depth = 1;
    let i = createRe.lastIndex;
    const start = i;
    while (i < markdown.length && depth > 0) {
      const ch = markdown[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      i += 1;
    }
    const body = markdown.slice(start, i - 1);
    const columns: string[] = [];
    const seen = new Set<string>();
    // Track paren depth across lines so a multi-line CHECK / CONSTRAINT body
    // (e.g. `... OR (status <> 'failed' ...)`) is never mistaken for a column.
    // A column definition only begins on a line whose starting depth is 0.
    let lineStartDepth = 0;
    for (const rawLine of body.split('\n')) {
      const startDepth = lineStartDepth;
      // Update depth for the next line, ignoring parens inside string literals.
      const noStrings = rawLine.replace(/'[^']*'/g, '');
      for (const ch of noStrings) {
        if (ch === '(') lineStartDepth += 1;
        else if (ch === ')') lineStartDepth = Math.max(0, lineStartDepth - 1);
      }
      if (startDepth > 0) continue; // inside a multi-line constraint expression
      const line = rawLine.trim();
      if (line === '' || line.startsWith('--')) continue;
      const colMatch = /^([a-z_][a-z0-9_]*)\s+["a-z(]/i.exec(line);
      if (colMatch === null) continue;
      const name = colMatch[1]!.toLowerCase();
      if (CONSTRAINT_KEYWORDS.has(name)) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      columns.push(name);
    }
    tables.push({ table, columns });
  }
  return tables;
}

/**
 * Normalize a documented or registered path for comparison. Path parameters are
 * collapsed to a single `:param` token so a documented `{project_id}` compares
 * equal to a route registered as `:id` — the parameter *name* is a free choice
 * on each side and is not what the gate is checking.
 */
export function normalizePath(path: string): string {
  return path
    .replace(/\?.*$/, '') // strip query string
    .replace(/#.*$/, '') // strip trailing comment (e.g. "# member+")
    .trim()
    .replace(/\{[a-z_]+\}/gi, ':param') // {asset_id} → :param
    .replace(/:[a-z_]+/gi, ':param') // :id → :param
    .replace(/\/$/, ''); // strip trailing slash
}

/**
 * Parse `METHOD /path` lines out of api-contracts.md fenced blocks. Only the
 * verbs the platform uses are recognized. Path parameters are collapsed to
 * `:param` so a documented `{asset_id}` compares equal to a registered `:id`.
 */
export function parseDocEndpoints(markdown: string): DocEndpoint[] {
  const endpoints: DocEndpoint[] = [];
  const seen = new Set<string>();
  const re = /^(GET|POST|PATCH|PUT|DELETE)\s+(\/[^\s]*)/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const method = match[1]!.toUpperCase();
    const path = normalizePath(match[2]!);
    // Ignore absolute URLs (e.g. the direct Cloudinary upload endpoint).
    if (path.startsWith('http')) continue;
    const key = `${method} ${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    endpoints.push({ method, path });
  }
  return endpoints;
}

/** Documented tables that are absent from the live catalog. */
export function findMissingTables(
  docTables: readonly DocTable[],
  actualTables: ReadonlySet<string>,
): string[] {
  return docTables.map((t) => t.table).filter((name) => !actualTables.has(name));
}

/** One documented `table.column` absent from the live catalog. */
export interface MissingColumn {
  readonly table: string;
  readonly column: string;
}

/**
 * Documented columns absent from the live catalog. A table missing entirely is
 * reported by {@link findMissingTables}, so a column check only runs for tables
 * that DO exist (avoids double-reporting every column of a missing table).
 */
export function findMissingColumns(
  docTables: readonly DocTable[],
  actualColumns: ReadonlyMap<string, ReadonlySet<string>>,
): MissingColumn[] {
  const missing: MissingColumn[] = [];
  for (const t of docTables) {
    const cols = actualColumns.get(t.table);
    if (cols === undefined) continue; // table absence handled separately
    for (const column of t.columns) {
      if (!cols.has(column)) missing.push({ table: t.table, column });
    }
  }
  return missing;
}

/**
 * Documented endpoints that are NOT registered anywhere (Node API ∪ ML service).
 * Direction is doc → reality: the gate requires the docs to name only endpoints
 * that exist, not that every route is documented.
 */
export function findUndocumentedEndpoints(
  docEndpoints: readonly DocEndpoint[],
  actualPaths: ReadonlySet<string>,
): DocEndpoint[] {
  return docEndpoints.filter((e) => !actualPaths.has(`${e.method} ${e.path}`));
}
