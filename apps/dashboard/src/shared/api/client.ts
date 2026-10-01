import { isApiFailure, type ApiEnvelope } from '@panchnama/shared/rn';
import { supabase } from '../supabase/client';
import { env } from '../env';

/**
 * Typed fetch wrapper for `@panchnama/api`.
 *
 * Every request carries the caller's Supabase JWT as a Bearer token; the API
 * resolves `org_id`/`user_id` and every authorization decision from that
 * verified token, never from a body the client controls (AGENTS.md §3.4). This
 * client therefore never sends an `org_id` — org isolation is the API + RLS,
 * not the UI. Responses follow the `{ data, error }` envelope
 * (api-contracts.md §6); a failure envelope throws a typed `ApiRequestError`
 * so a caller can never silently treat an error body as data (AGENTS.md §3.6).
 */

export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly query?: Readonly<Record<string, string | number | undefined>>;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path.replace(/^\//, ''), env.apiUrl.endsWith('/') ? env.apiUrl : `${env.apiUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/**
 * Perform a request and unwrap the envelope. Throws `ApiRequestError` on any
 * non-2xx status or failure envelope.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, signal } = options;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(await authHeader()),
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  if (signal) {
    init.signal = signal;
  }

  const response = await fetch(buildUrl(path, query), init);

  let envelope: ApiEnvelope<T> | null = null;
  try {
    const parsed: unknown = await response.json();
    // Only accept a well-formed envelope object; a non-object body (e.g. a
    // proxy error page) is treated as no envelope rather than mis-read as a
    // failure with undefined fields.
    if (parsed !== null && typeof parsed === 'object' && 'error' in parsed && 'data' in parsed) {
      envelope = parsed as ApiEnvelope<T>;
    }
  } catch {
    envelope = null;
  }

  if (envelope !== null && isApiFailure(envelope)) {
    throw new ApiRequestError(
      envelope.error.code,
      envelope.error.message,
      response.status,
      envelope.error.details,
    );
  }

  if (!response.ok) {
    throw new ApiRequestError('INTERNAL_ERROR', `Request failed (${response.status})`, response.status);
  }

  if (envelope === null) {
    throw new ApiRequestError('INTERNAL_ERROR', 'Malformed response envelope', response.status);
  }

  return envelope.data;
}
