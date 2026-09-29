-- Phase 8 (dashboard end-to-end) — Custom Access Token Hook: hoist org_id to a
-- top-level JWT claim so RLS can read it.
--
-- WHY THIS EXISTS (a real bug the pgTAP suite never exercised)
--
--   Every RLS policy isolates by `(auth.jwt() ->> 'org_id')::uuid`. That reads a
--   TOP-LEVEL claim. But a real Supabase/GoTrue access token nests the value the
--   platform_admin wrote at invite redemption under `app_metadata`:
--
--       { "sub": "...", "role": "authenticated",
--         "app_metadata": { "org_id": "…", "role": "member" } }
--
--   So `auth.jwt() ->> 'org_id'` is NULL for a real token and every org-scoped
--   SELECT returns zero rows. The Phase 1 pgTAP tests passed only because
--   `test_helpers.set_claims` hoists org_id to the top level — a shape a real
--   token never has. Proven empirically against the local stack (Phase 8):
--     * nested  (real)      → 0 assets visible
--     * top-level (pgTAP)   → 1 asset visible
--
--   ARCHITECTURE.md §"Row isolation" asserts "No Custom Access Token Hook … is
--   required". That reasoning is wrong for Postgres RLS: app_metadata is
--   server-controlled (good, untamperable) but NOT a top-level claim, so RLS
--   cannot see it. This hook is the documented Supabase mechanism to bridge that
--   gap. It is additive and reversible (disable in config.toml + drop function).
--
-- WHAT IT DOES / WHAT IT DELIBERATELY DOES NOT
--
--   * Copies app_metadata.org_id → top-level `org_id` claim. That is all RLS
--     needs; the SELECT policies key only on org_id.
--   * Copies app_metadata.role → top-level `app_role` (a NON-reserved name).
--     It does NOT touch the reserved top-level `role` claim, which PostgREST
--     uses to choose the database role (`authenticated`). Clobbering it with
--     'member' would make PostgREST attempt `SET ROLE member` and fail. Existing
--     RLS that reads `auth.jwt() ->> 'role'` for platform_admin escalation is a
--     Phase 1 concern and is out of scope here; the API re-derives role from the
--     verified JWT's app_metadata regardless (plugins/auth.ts), so authorization
--     is unaffected.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_claims jsonb;
  v_meta   jsonb;
BEGIN
  v_claims := COALESCE(event -> 'claims', '{}'::jsonb);
  -- The custom-access-token hook event carries app_metadata INSIDE `claims`
  -- (GoTrue copies it there); the event has no separate top-level `user` object.
  v_meta   := COALESCE(v_claims -> 'app_metadata', '{}'::jsonb);

  IF v_meta ? 'org_id' THEN
    v_claims := jsonb_set(v_claims, '{org_id}', v_meta -> 'org_id', true);
  END IF;

  -- Non-reserved mirror of the application role. Never overwrite top-level
  -- `role`, which PostgREST maps to a database role.
  IF v_meta ? 'role' THEN
    v_claims := jsonb_set(v_claims, '{app_role}', v_meta -> 'role', true);
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims, true);
END;
$$;

-- GoTrue runs the hook as `supabase_auth_admin`. Grant exactly that, and revoke
-- from everyone else so a client cannot call it directly (Supabase hook setup).
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
