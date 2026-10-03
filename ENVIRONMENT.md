# Environment Reference

> **Panchnama** — a written record of inspection, signed by a witness.

**No secret values appear in this file.** It documents environment variable names, exposure rules, and service configuration.

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

**`SUPABASE_JWT_SECRET` is required and server-only.** The API verifies Supabase-issued JWTs locally with the project's HS256 JWT secret (`apps/api/src/plugins/auth.ts` → `jwt.verify(token, secret, { algorithms: ['HS256'] })`, wired in `apps/api/src/app.ts`), rather than a round-trip to `auth.getUser()`. It is a 🔴 secret: no `VITE_`/`EXPO_PUBLIC_` prefix, never returned in a response, and redacted from logs. Source it from Supabase → Project Settings → API → JWT Secret.

**`INTERNAL_JWT_SECRET` must be byte-identical** in api and ml-service. They sign and verify the same token; a mismatch makes every API→ML call 401.

**`DASHBOARD_URL`** drives both the CORS origin and generated `invite_url`. Set it to the deployed dashboard URL in production.

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

The repository `.gitignore` covers `.env`, `.env.local`, `.env.*.local`, and `.env.production`. Verify that local files are ignored with `git check-ignore`.

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

## 5. Supabase organization membership

Each user belongs to one organization, so organization membership is stored in the user's server-controlled `app_metadata`; a separate `org_members` table and Custom Access Token Hook are not required.

Organization membership works as follows:

- `platform_admin` issues an `invite_tokens` row carrying `org_id`, `email`, `role`, `token_hash`, and `expires_at`
- on redemption the API calls `auth.admin.updateUserById()` to write `org_id` and `role` into the user's `app_metadata`
- `app_metadata` is server-controlled and not user-writable, so the JWT claim cannot be tampered with
- RLS reads `auth.jwt() ->> 'org_id'` as specified, with no hook and no membership table

`invite_tokens` DDL, RLS, and the redemption checks are in
`docs/architecture/DATABASE_SCHEMA.md` under Invite Tokens.

**Revisit this design** if users need membership in multiple organizations or roles that differ by project; those requirements would need a membership table and corresponding authorization design.

---

## 6. Verification

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

## 7. Security invariants

1. Never add `CLOUDINARY_API_SECRET` or `SUPABASE_SERVICE_KEY` to a `VITE_` or `EXPO_PUBLIC_` variable.
2. Never accept `public_id` from a client. Resolve by `asset_id` under RLS.
3. Never query Cloudinary for product reads. Postgres is the system of record.
4. Never derive org from a request body. Use verified JWT claims.
5. Never hand-roll Cloudinary signing. Use SDK v2 and `@cloudinary/url-gen`.
6. Never report an integrity check as `pass` when it is `unknown`.
7. Product, legal, quota, retention, and cost decisions must be explicitly approved before they are hardcoded.
