/**
 * Uniform API response envelope and typed error codes.
 *
 * Every HTTP response is either `{ data, error: null }` or `{ data: null, error }`
 * (`docs/architecture/api-contracts.md` §6). A discriminated union on the `error`
 * field lets callers narrow safely without inspecting the HTTP status twice.
 */

/**
 * Typed error codes. The first five are the documented contract
 * (`api-contracts.md` §6); the remainder correspond to status codes the same
 * document defines (`422`, `429`, `507`) so every failure path has a stable,
 * machine-readable code rather than a bare string.
 */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR', // 400
  'UNAUTHORIZED', // 401
  'FORBIDDEN', // 403
  'NOT_FOUND', // 404
  'UNPROCESSABLE', // 422 — business-rule rejection
  'RATE_LIMITED', // 429
  'QUOTA_EXCEEDED', // 507 — org over quota; never delete media to recover
  'INTERNAL_ERROR', // 500
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Machine-readable error body. `details` carries field-level context. */
export interface ApiError {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Successful envelope: `data` present, `error` explicitly `null`. */
export interface ApiSuccess<T> {
  readonly data: T;
  readonly error: null;
}

/** Failure envelope: `data` explicitly `null`, `error` present. */
export interface ApiFailure {
  readonly data: null;
  readonly error: ApiError;
}

/** The response shape returned by every endpoint. */
export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

/** Construct a success envelope. */
export function ok<T>(data: T): ApiSuccess<T> {
  return { data, error: null };
}

/** Construct a failure envelope. */
export function fail(
  code: ApiErrorCode,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ApiFailure {
  return details === undefined
    ? { data: null, error: { code, message } }
    : { data: null, error: { code, message, details } };
}

/** Type guard: narrow an envelope to its failure branch. */
export function isApiFailure<T>(envelope: ApiEnvelope<T>): envelope is ApiFailure {
  return envelope.error !== null;
}
