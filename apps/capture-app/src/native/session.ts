/**
 * Session token source for authenticated API calls (BUILD_ORDER Phase 5
 * carry-over: wire the capture app to the real API).
 *
 * The API derives `org_id`, `user_id`, and role from the verified Supabase JWT
 * — never from the request body or an env var (AGENTS.md §3.4). This module is
 * the single place the app reads that JWT. A real Supabase login flow (Phase 8)
 * deposits the session token in the platform secure store under {@link SESSION_KEY};
 * this reader hands it to the API client.
 *
 * There is intentionally no fallback to an env-injected org id: an unauthenticated
 * app has no projects to show, and pretending otherwise would violate §3.4.
 */
import * as SecureStore from 'expo-secure-store';

export const SESSION_KEY = 'impact.session.jwt.v1';

/**
 * Return the current Supabase session JWT, or null if the user is not signed in.
 * The caller attaches it as `Authorization: Bearer <jwt>`; the API verifies it.
 */
export async function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY);
}

/** Persist a session token after login (used by the Phase 8 auth flow). */
export async function setSessionToken(jwt: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, jwt, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
