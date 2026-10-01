/**
 * Cross-cutting types: the verified caller identity and the typed HTTP error the
 * error handler turns into an envelope.
 *
 * `AuthContext` is the ONLY source of `org_id` / `user_id` / `role` for a
 * request (AGENTS.md §3.4). It is derived from the verified Supabase JWT by the
 * auth plugin and is never populated from a request body.
 */
import type { Role } from '@panchnama/shared';
import type { ApiErrorCode } from '@panchnama/shared';

/** Verified caller identity, resolved from the Supabase JWT claims only. */
export interface AuthContext {
  readonly userId: string;
  readonly orgId: string;
  readonly role: Role;
  /** The raw bearer token, forwarded to the request-scoped Supabase client so RLS applies. */
  readonly jwt: string;
}

/**
 * A typed error a route may throw. The error handler maps `code` to an HTTP
 * status and emits the `{ data: null, error }` envelope with a `request_id`.
 * Carrying the code (not just a message) keeps every failure path machine
 * readable (AGENTS.md §3.6).
 */
export class HttpError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: ApiErrorCode,
    statusCode: number,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'HttpError';
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export const errors = {
  unauthorized: (message = 'Missing or invalid credentials', details?: Record<string, unknown>) =>
    new HttpError('UNAUTHORIZED', 401, message, details),
  forbidden: (message = 'Forbidden', details?: Record<string, unknown>) =>
    new HttpError('FORBIDDEN', 403, message, details),
  notFound: (message = 'Not found', details?: Record<string, unknown>) =>
    new HttpError('NOT_FOUND', 404, message, details),
  validation: (message = 'Validation failed', details?: Record<string, unknown>) =>
    new HttpError('VALIDATION_ERROR', 400, message, details),
  unprocessable: (message = 'Unprocessable', details?: Record<string, unknown>) =>
    new HttpError('UNPROCESSABLE', 422, message, details),
  rateLimited: (message = 'Rate limited', details?: Record<string, unknown>) =>
    new HttpError('RATE_LIMITED', 429, message, details),
  quotaExceeded: (message = 'Storage quota exceeded', details?: Record<string, unknown>) =>
    new HttpError('QUOTA_EXCEEDED', 507, message, details),
  internal: (message = 'Internal error', details?: Record<string, unknown>) =>
    new HttpError('INTERNAL_ERROR', 500, message, details),
} as const;
