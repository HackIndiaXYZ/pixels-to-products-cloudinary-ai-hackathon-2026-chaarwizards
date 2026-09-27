-- Phase 1 — Organizations & Invite Tokens
-- Source: docs/architecture/DATABASE_SCHEMA.md §Organizations, §Invite Tokens
--
-- Role model (carried in the JWT app_metadata, resolved by Postgres, never read
-- from a request body — AGENTS.md §3.4/§3.10):
--   platform_admin  all orgs
--   org_admin       own org only
--   member          own org only, write
--   viewer          own org only, read-only

CREATE TABLE orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('government', 'ngo', 'partner', 'funder')),
  settings JSONB DEFAULT '{}',
  -- Cost guardrail. 50 GB per org, warn at 80%, reject new uploads at 100%.
  quota_bytes BIGINT NOT NULL DEFAULT 53687091200,
  bytes_used BIGINT NOT NULL DEFAULT 0,
  -- Earliest automatic deletion. 7 years from created_at.
  -- Enforced by the reconciliation job, not by a Postgres trigger.
  retention_years INT NOT NULL DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS. platform_admin is a platform role; org_admin is scoped to its own org.
-- Conflating them would let any org admin read every org.
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orgs_select_own" ON orgs FOR SELECT
  USING (
    id = (auth.jwt() ->> 'org_id')::uuid
    OR (auth.jwt() ->> 'role') = 'platform_admin'
  );

-- UPDATE needs BOTH USING (which rows you may touch) and WITH CHECK (what the
-- row may become). A FOR ALL/FOR UPDATE policy with only USING is a
-- write-escalation bug (AGENTS.md §3.4, DATABASE_SCHEMA.md RLS summary).
CREATE POLICY "orgs_admin_update" ON orgs FOR UPDATE
  USING (
    ((auth.jwt() ->> 'org_id')::uuid = id AND (auth.jwt() ->> 'role') = 'org_admin')
    OR (auth.jwt() ->> 'role') = 'platform_admin'
  )
  WITH CHECK (
    ((auth.jwt() ->> 'org_id')::uuid = id AND (auth.jwt() ->> 'role') = 'org_admin')
    OR (auth.jwt() ->> 'role') = 'platform_admin'
  );

-- No INSERT policy: orgs are provisioned by platform_admin through the API
-- using the service role. There is no self-service signup (AGENTS.md §3.10).


-- Invite Tokens — single-use, address-bound, 72-hour.
CREATE TABLE invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  -- Binds the token to one recipient. Without this a token can be forwarded
  -- and redeemed by anyone, including as org_admin.
  email CITEXT NOT NULL,
  -- The role granted on redemption. Never 'platform_admin': that role is
  -- assigned out of band, not by redeeming a link.
  role TEXT NOT NULL CHECK (role IN ('org_admin', 'member', 'viewer')),
  -- SHA-256 of the raw token. The raw token is returned once, at creation,
  -- and is never stored or logged (AGENTS.md §3.10).
  token_hash TEXT NOT NULL UNIQUE,
  -- 72 hours from issue. Enforced on redemption, not by a cron.
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,       -- set on successful redemption
  redeemed_by UUID,          -- auth.users.id of whoever redeemed it
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_org ON invite_tokens (org_id);
CREATE INDEX idx_invites_email ON invite_tokens (email);

ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;

-- Redemption reads by hash. This is deliberately NOT org-scoped: the recipient
-- is not authenticated yet when they redeem. Isolation comes from the token
-- being unguessable, single-use, and 256-bit random (DATABASE_SCHEMA.md §RLS).
CREATE POLICY "invites_redeem_by_hash" ON invite_tokens FOR SELECT
  USING (token_hash = current_setting('request.jwt.claim.token_hash', true));

-- No INSERT policy: platform_admin issues invites via the service role.
-- No UPDATE policy: redemption is a service-role UPDATE, so a client cannot
-- mark a token used or extend its own expiry.
