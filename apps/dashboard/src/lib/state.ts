import type { Role } from '../types/database';

export type DataState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string; retry?: () => void }
  | { status: 'unauthorized'; requiredRole?: Role }
  | { status: 'empty'; reason?: string }
  | { status: 'unknown' }
  | { status: 'ready'; data: T };

export const LOADING_COPY = 'Loading…';
export const ERROR_COPY = 'Unable to load data.';
export const UNKNOWN_COPY = 'Unknown';
export const UNAVAILABLE_COPY = 'Unavailable';
export const UNAVAILABLE_MASK_COPY = 'Change mask unavailable';
export const UNAVAILABLE_REASON_COPY = 'Reason unavailable';
export const UNSUPPORTED_SECTOR_COPY = 'Unsupported for this sector';

export const EMPTY_COPY = {
  evidence: 'No evidence assets found.',
  geospatial: 'No geotagged evidence available.',
  templates: 'No report templates available.',
  quarantine: 'No assets in quarantine.',
  changes: 'No change events found.',
  packages: 'No evidence packages found.',
  projects: 'No projects found.',
  activity: 'No activity records found.',
  observations: 'No observations recorded.',
} as const;

export function loading<T>(): DataState<T> {
  return { status: 'loading' };
}

export function failed<T>(retry?: () => void): DataState<T> {
  return retry === undefined
    ? { status: 'error', message: ERROR_COPY }
    : { status: 'error', message: ERROR_COPY, retry };
}

export function unauthorized<T>(requiredRole?: Role): DataState<T> {
  return requiredRole === undefined
    ? { status: 'unauthorized' }
    : { status: 'unauthorized', requiredRole };
}

export function empty<T>(reason?: string): DataState<T> {
  return reason === undefined ? { status: 'empty' } : { status: 'empty', reason };
}

export function undetermined<T>(): DataState<T> {
  return { status: 'unknown' };
}

export function ready<T>(data: T): DataState<T> {
  return { status: 'ready', data };
}

/** The single rule every service and hook uses: a list with no rows is `empty`, never `ready([])`. */
export function readyOrEmpty<T>(rows: readonly T[], reason?: string): DataState<T[]> {
  return rows.length === 0 ? empty(reason) : ready([...rows]);
}

export function isReady<T>(state: DataState<T>): state is { status: 'ready'; data: T } {
  return state.status === 'ready';
}

export function isSettled<T>(state: DataState<T>): boolean {
  return state.status !== 'loading';
}

/* ── field-level honest states ────────────────────────────────────────────────
   A nullable column inside a row is not the same as an absent row. `Field<T>` keeps
   that distinction: `value` carries a real column read, `unknown` marks a column the
   backend could not determine, `unavailable` marks something that was not returned. */

export type Field<T> =
  | { state: 'value'; value: T }
  | { state: 'unknown' }
  | { state: 'unavailable' };

export function fieldValue<T>(value: T): Field<T> {
  return { state: 'value', value };
}

/** Used for a column that is present but NULL — the backend cannot determine it. */
export function fieldUnknown<T>(): Field<T> {
  return { state: 'unknown' };
}

/** Used for a field the query surface did not return at all. */
export function fieldUnavailable<T>(): Field<T> {
  return { state: 'unavailable' };
}

/** Maps a nullable column onto an honest field state. */
export function fieldFromNullable<T>(value: T | null | undefined): Field<T> {
  return value === null || value === undefined ? fieldUnknown<T>() : fieldValue(value);
}

export function hasValue<T>(field: Field<T>): field is { state: 'value'; value: T } {
  return field.state === 'value';
}

export function fieldLabel(field: Field<unknown>, fallback = UNKNOWN_COPY): string {
  return field.state === 'value' ? String(field.value) : fallback;
}

export function fieldNumber(field: Field<number>, fallback = UNKNOWN_COPY): string {
  return field.state === 'value' ? formatNumber(field.value) : fallback;
}

export function formatNumber(value: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat('en-US').format(value) : UNKNOWN_COPY;
}

/** Postgres bigint columns may arrive as number or string; both must render honestly. */
export function bigIntText(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return UNKNOWN_COPY;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? formatNumber(parsed) : String(value);
}

/** Renders an opaque jsonb value. Anything that is not a primitive reads as Unknown. */
export function jsonText(value: unknown, fallback = UNKNOWN_COPY): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? formatNumber(value) : fallback;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return fallback;
}
