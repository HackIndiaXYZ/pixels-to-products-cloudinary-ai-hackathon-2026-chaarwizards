# Environment Reference

> **Panchnama** — a written record of inspection, signed by a witness.

**No secret values appear in this file.** It documents variable *names*, exposure rules, and structure so an AI agent can work with the codebase without ever seeing a credential.

Real values: `~/.config/impact-platform/env-secrets.local.txt` (outside all git repos, mode 600).

---

## 1. Service topology

```
capture-app (Expo)  ──unsigned upload──▶  Cloudinary
        │                                      │
        │ signed request                       │ webhook
        ▼                                      ▼
   dashboard (React 19 + Vite) ──Bearer JWT──▶  api (Fastify)
                                                  │ internal JWT
                                                  ▼
                                            ml-service (FastAPI)
                                                  │
                                                  ▼
                                    Supabase / Postgres  ← system of record
```

Cloudinary stores media and performs transformations. **Every product read goes through Postgres.** Never the Cloudinary Search API, `resources_by_*`, or `api.list()` — those have no `org_id` filter and would leak one org's assets to another.

---

## 2. Variables

| Variable | api | ml-service | dashboard | capture-app | Class |
|---|:-:|:-:|:-:|:-:|---|
| `SUPABASE_URL` | ✓ | ✓ | `VITE_` | `EXPO_PUBLIC_` | public |
| `SUPABASE_ANON_KEY` | ✓ | — | `VITE_` | `EXPO_PUBLIC_` | public |
| `SUPABASE_SERVICE_KEY` | ✓ | ✓ | **never** | **never** | 🔴 secret |
| `SUPABASE_JWT_SECRET` | ✓ | — | **never** | **never** | 🔴 secret |
| `CLOUDINARY_CLOUD_NAME` | ✓ | ✓ | `VITE_` | `EXPO_PUBLIC_` | public |
| `CLOUDINARY_API_KEY` | ✓ | ✓ | **never** | **never** | semi-public |
| `CLOUDINARY_API_SECRET` | ✓ | ✓ | **never** | **never** | 🔴 secret |
| `CLOUDINARY_UPLOAD_PRESET` | ✓ | — | `VITE_` | `EXPO_PUBLIC_` | public |
| `INTERNAL_JWT_SECRET` | ✓ | ✓ | **never** | **never** | 🔴 secret |
| `REDIS_URL` | ✓ | — | — | — | 🔴 secret |
| `DASHBOARD_URL` | ✓ | — | — | — | config |
| `ML_SERVICE_URL` | ✓ | — | — | — | config |
| `ORG_UPLOAD_RATE_MAX` | ✓ | — | — | — | config |
| `ORG_UPLOAD_RATE_WINDOW_MS` | ✓ | — | — | — | config |
| `WEIGHTS_DIR` | — | ✓ | — | — | config |

**Prefix rules**

- `VITE_*` → inlined into the dashboard JS bundle at build time, publicly readable
- `EXPO_PUBLIC_*` → inlined into the app binary, readable on a jailbroken device
- **A secret with either prefix is a leaked secret.** Renaming is not a fix.

**`SUPABASE_JWT_SECRET` is required and server-only.** The API verifies Supabase-issued JWTs *locally* with the project's HS256 JWT secret (`apps/api/src/plugins/auth.ts` → `jwt.verify(token, secret, { algorithms: ['HS256'] })`, wired in `apps/api/src/app.ts`), rather than a round-trip to `auth.getUser()`. It is a 🔴 secret: no `VITE_`/`EXPO_PUBLIC_` prefix, never returned in a response, and redacted from logs. Source it from Supabase → Project Settings → API → JWT Secret. (An earlier revision of this doc claimed the variable did not exist; that was wrong — the local-verification design needs it.)

**`INTERNAL_JWT_SECRET` must be byte-identical** in api and ml-service. They sign and verify the same token; a mismatch makes every API→ML call 401.

**`DASHBOARD_URL`** drives both the CORS origin and generated `invite_url`. Unset in production, every invite link points at `localhost:5173`.

**`ORG_UPLOAD_RATE_MAX` / `ORG_UPLOAD_RATE_WINDOW_MS`** (Phase 11) bound the per-org
upload rate on the webhook ingest path (default 600 uploads / 60 000 ms). Keyed on
the org derived from the signed `project_id`, so throttling one tenant never denies
service to another — the unsigned-preset abuse mitigation. Both are optional config
with safe defaults, never secrets.

---

## 3. Files

| Path | Keys | Gitignored |
|---|:-:|:-:|
| `apps/api/.env.local` | 14 | ✓ |
| `apps/ml-service/.env.local` | 7 | ✓ |
| `apps/dashboard/.env.local` | 5 | ✓ |
| `apps/capture-app/.env.local` | 5 | ✓ |

`.gitignore` lines 14–17 cover `.env`, `.env.local`, `.env.*.local`, `.env.production`. Confirmed active via `git check-ignore`, not assumed.

Copy the four files to every clone. They are gitignored by design, so there is no mechanism to sync them.

---

## 4. Cloudinary upload preset `verified_capture`

| Setting | Value |
|---|---|
| Signing mode | **Unsigned** |
| Asset folder | `evidence` |
| Disallow public ID | **ON** |
| Generated public ID | **Auto-generate unguessable** |
| Display name | Use filename |
| Resource type | image **and** video |
| Tags | `evidence` (static, single value) |

**Addons enabled:** Tags · Context · perceptual hash · media metadata
**Addons disabled:** Moderation · faces · chaptering · transcription

Rationale: enable what the architecture reads from Cloudinary; skip anything a CV model computes. Models produce metrics, Cloudinary supplies bytes and cheap metadata.

- `categorization: google_tagging` is **not yet confirmed enabled** — check Manage and Analyze. Without it the `observations` table stays empty (FR3.6).
- Originals are `type: authenticated`; derivatives are `type: upload` + signed.
- Preset is currently **unsigned**. Phase 3 assumes the upload flow is unsigned; switching to authenticated must land together with the webhook fix or uploads break.

---

## 5. Supabase

Project ref `uypmapvrttnkjnzjlotj` · region should match the Cloudinary account.

### ✅ `org_members` — resolved, not a gap

Earlier reviews flagged the missing `org_members` table as a blocker, on the assumption that RLS
would need a Custom Access Token Hook reading a membership join table. **That assumption is
withdrawn.** Each user belongs to exactly one org, so no join table is needed.

The design is now:

- `platform_admin` issues an `invite_tokens` row carrying `org_id`, `email`, `role`, `token_hash`, and `expires_at`
- on redemption the API calls `auth.admin.updateUserById()` to write `org_id` and `role` into the user's `app_metadata`
- `app_metadata` is server-controlled and not user-writable, so the JWT claim cannot be tampered with
- RLS reads `auth.jwt() ->> 'org_id'` as specified, with no hook and no membership table

`invite_tokens` DDL, RLS, and the three-condition redemption check are in
`docs/architecture/DATABASE_SCHEMA.md` §Invite Tokens.

**Revisit only if** a user ever needs membership in more than one org, or if roles need to differ
per project rather than per org. Both would require this table and a Custom Access Token Hook.

---

## 6. Known state

| # | Blocker | Impact |
|---|---|---|
| 1 | `001_core_schema.sql` not applied | 12 of 13 queried tables missing |
| 2 | Zero auth users | nobody can log in |
| 3 | Webhook signature check fails open | unsigned POST inserts asset rows |
| 4 | `canonicalize` has no Python port | cross-language hashing unverified |
| 5 | 2 test files, both in `packages/shared` | CI `pytest` passes trivially |
| 6 | `.cursorrules` referenced by `AGENTS.md` but absent | agent may hallucinate its contents |
| 7 | No model weights | inference untestable |
| 8 | Mobile Ed25519 unimplemented | `signature_tier` cannot be `'device'` |

---

## 7. Verification

Run before every commit:

```bash
# No secret value may be in a tracked file
git grep -lF "$REAL_SECRET" -- . | wc -l        # must be 0

# Nothing from .env.local is staged
git status --porcelain | grep -i env            # must print nothing

# All four env files ignored
for s in api dashboard capture-app ml-service; do
  git check-ignore -q "apps/$s/.env.local" || echo "LEAK RISK: $s"
done
```

Note: `git grep -E "CLOUDINARY_API_SECRET|service_role"` produces **false positives** — it matches variable *names* in source (`process.env['SUPABASE_SERVICE_KEY']`) and empty `.env.example` lines. Search for literal *values*, not key names.

---

## 8. Hard rules for any agent

1. Never add `CLOUDINARY_API_SECRET` or `SUPABASE_SERVICE_KEY` to a `VITE_` or `EXPO_PUBLIC_` variable.
2. Never accept `public_id` from a client. Resolve by `asset_id` under RLS.
3. Never query Cloudinary for product reads. Postgres is the system of record.
4. Never derive org from a request body. Use verified JWT claims.
5. Never hand-roll Cloudinary signing. Use SDK v2 and `@cloudinary/url-gen`.
6. Never report an integrity check as `pass` when it is `unknown`.
7. Ask before hardcoding any product, legal, quota, retention, or cost decision.
