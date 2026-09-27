# AGENTS.md

Instructions for any AI coding agent or engineer working in this repository.

---

## 1. What This Project Is

An AI media intelligence platform. Field workers capture geo-tagged photos and short videos; the platform verifies their authenticity, analyses them with custom computer-vision models, pairs before/after evidence, and generates audit-ready reports.

Read these before writing code, in this order:

1. `PRD.md` — what to build, with acceptance criteria
2. `ARCHITECTURE.md` — how it is built, and why
3. `BUILD_ORDER.md` — what to build first, and the gate for each phase
4. `docs/architecture/DATABASE_SCHEMA.md` — table DDL
5. `docs/architecture/api-contracts.md` — endpoint contracts
6. `docs/architecture/CLOUDINARY_TRANSFORMATIONS.md` — **the only verified list of valid Cloudinary parameters. Do not invent one.**
7. `apps/dashboard/.cursorrules` (created by `create-cloudinary-react`) — Cloudinary's own SDK patterns. Use it for `@cloudinary/url-gen` imports and overlay syntax; it is authoritative over any guess

---

## 2. Repository Layout

```
apps/
  api/            Node 20 · Fastify · TypeScript · BullMQ
  ml-service/     Python 3.11 · FastAPI · PyTorch · YOLOv8 · ChangeFormer
  capture-app/    Expo · React Native · expo-camera · expo-location
  dashboard/      React 19 · Vite · TanStack Query · MapLibre GL · @cloudinary/react
packages/
  shared/         Types, Zod schemas, RFC 8785 canonicalization, signing payload
  ui-components/  Shared React components
docs/
  architecture/   DATABASE_SCHEMA · api-contracts · CLOUDINARY_TRANSFORMATIONS ·
                  FILE_STRUCTURE · FRONTEND_ARCHITECTURE
  planning/       FINE_TUNING_STRATEGY
  operations/     deployment
PRD.md            Product requirements
ARCHITECTURE.md   System design + decision log + secret inventory
BUILD_ORDER.md    Phased execution plan with gates
README.md         Human-facing overview
```

---

## 3. Non-Negotiable Rules

These are correctness requirements, not preferences. Do not weaken them to make a task pass.

### 3.1 Source evidence is immutable
- Never `UPDATE` or `DELETE` an original asset row or an original Cloudinary asset.
- Any resize, crop, re-encode, caption, or generative edit creates a **new** row in `asset_derivatives` with a `parent_asset_id` and the exact `transformation` string.
- Evidence columns are protected by column-level grants and a `BEFORE UPDATE` trigger. Do not grant `UPDATE` on them to bypass a failing test.

### 3.2 Metrics come from CV models, never LLMs
- Numbers that appear in a report must originate from a versioned model in `model_registry`.
- An LLM may write prose that summarizes already-computed metrics. It may not produce, adjust, or infer a metric.
- Every `change_events` row records `model_version`.

### 3.3 Never fall back to another sector's model
- If `model_registry.status != 'trained'`, return `{"status": "unsupported"}`.
- A wrong-sector number in a donor report is a credibility failure, not a degraded experience.

### 3.4 The client is untrusted
- The capture app signs; the API re-verifies every signature and hash independently.
- Never read `org_id`, `user_id`, or any authorization decision from a request body. Use the verified Supabase JWT claims.
- RLS is the isolation boundary. Application-level `WHERE org_id = ...` is defense in depth, not a replacement.

### 3.5 Secrets never reach a client
- `CLOUDINARY_API_SECRET`, Supabase service-role key, and the service `GRPC_AUTH` token are server-only.
- Verify with `git grep` before any commit. The capture app uses an unsigned upload preset and the dashboard uses only the Supabase anon key.

### 3.6 No silent degradation
- Every failure path writes a row or a log with a reason: `change_events.status = 'failed'`, `assets.verification = 'failed'`, a job retry record.
- Never swallow an error to make a test pass.

### 3.7 Clock skew is not offline dwell
- `server_received_at - device_capture_timestamp` conflates dwell, skew, and latency. Do not present it as a skew check.
- Use `sync_delay_seconds = server_received_at - upload_started_at` for dwell, and a signed NTP offset for skew.
- Integrity checks return three states: `pass`, `fail`, `unknown`. Only `fail` blocks a report. Never report `unknown` as `pass`.

### 3.8 Canonical hashing is RFC 8785
- Both TypeScript and Python must produce byte-identical canonical JSON. Shared test fixtures are mandatory.
- Do not use Postgres `jsonb::text` to reproduce a client-computed hash. The serializers do not agree.
- The audit hash chain must serialize concurrent appends per asset (`pg_advisory_xact_lock`) and hash the **stored** `hashed_at`, not `clock_timestamp()`, or verification can never reproduce it.

### 3.9 Cloudinary is a media pipeline, not a database
- Supabase/Postgres is the system of record. Every product read runs against Postgres.
- **Never serve a query from the Cloudinary Search API, `resources_by_*`, or `api.list()`.** Those endpoints have no `org_id` filter, so they would expose one org's assets to another. See `ARCHITECTURE.md` §3.2.1.
- Cloudinary tags from `categorization` / `detection` are copied into `observations` at ingest. Never query them back from Cloudinary.
- The only two legitimate uses of the Cloudinary Admin API: nightly reconciliation (one-way integrity check) and signing delivery URLs for assets already selected via Postgres.
- Cloudinary's job is bytes plus transformations — resize/crop/format/quality, generative edits on report copies, video clip extraction, streaming. Nothing queryable.

### 3.10 No self-service signup
- Orgs are provisioned by a `platform_admin` through `POST /v1/orgs`. There is no public registration endpoint.
- Invite tokens are single-use, expire in 72 hours, and are stored hashed. Never store a raw invite token.
- Roles are `platform_admin` (all orgs), `org_admin` (own org), `member` (own org, write), `viewer` (own org, read-only). Resolve them from the verified JWT only.

### 3.11 Never hand-roll Cloudinary signing
- Use `@cloudinary/url-gen` and the Node SDK v2 helpers. Do not write HMAC by hand.
- URL signing grants **no expiry**; the `v{...}` segment is a cache-buster. Real expiry comes from the `auth_token` on `type: authenticated` originals.
- Originals are `authenticated`; derivatives are `upload` + signed. Do not swap these.
- A client never supplies a `public_id`. It asks for a URL by `asset_id`; the API resolves under RLS.
- Generative transforms are asynchronous (420/423). They are an eager upload parameter or a BullMQ job — never a synchronous `fetch()`.

---

## 4. Conventions

### TypeScript
- `strict: true`, `noUncheckedIndexedAccess: true`. No `any` except at third-party boundaries, where it is wrapped in a typed adapter.
- `pnpm` only. Never `npm install` or `yarn`.
- Runtime validation with Zod at every trust boundary: HTTP input, webhook payloads, Cloudinary responses, queue messages.
- Prefer named exports. One component or function per file unless tightly coupled.
- Imports: `@impact/shared` for cross-service types. Never import across `apps/*`.

### Python
- `ruff` + `mypy --strict`. Fully type-annotated public functions.
- Pydantic models for every request and response.
- Model weights are loaded once per `(key, version)` and cached on the model object. Never instantiate a detector inside a request handler.
- `pytest` for all tests; fixtures for synthetic images and videos.

### React
- React 19 + Vite (scaffolded by `create-cloudinary-react`). Not Next.js.
- Feature-based folders: `src/features/{search,assets,changes,reports,integrity}/`.
- Server state in TanStack Query only. No Redux.
- No secret or private config in any client bundle. Only `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` are client-safe; `CLOUDINARY_API_SECRET` must never carry a `VITE_` prefix.
- Build Cloudinary URLs with `@cloudinary/url-gen` (`cld.image(...).resize(...)`), not hand-written URL strings. Copy import paths from `.cursorrules` — do not guess them.
- Server SDK: `import { v2 as cloudinary } from 'cloudinary'`. **Never v1.**

### SQL
- All schema changes as numbered migrations in `supabase/migrations/`. Never edit an applied migration.
- Every table gets RLS enabled and at least one policy before it ships.
- Evidence columns get column grants plus an immutability trigger.

---

## 5. Commands

```bash
pnpm install                # install workspace
pnpm dev                    # run all services
pnpm build                  # build all
pnpm lint                   # eslint
pnpm typecheck              # tsc --noEmit
pnpm test                   # vitest

# ML service
cd apps/ml-service
ruff check . && mypy .
pytest

# Database
supabase db reset           # apply migrations from scratch
supabase db diff -f name    # generate a migration from schema drift
supabase migration list

# Secrets check — must return nothing before every commit
git grep -nE "cloudinary_api_secret|CLOUDINARY_API_SECRET=|service_role|SUPABASE_SERVICE"
```

---

## 6. Definition of Done

A task is done only when all of these hold:

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass; `ruff`, `mypy`, `pytest` pass for ML changes
- [ ] Input validated with Zod or Pydantic at the trust boundary
- [ ] Errors handled explicitly; failures persisted with a reason, never swallowed
- [ ] RLS present on any new table; evidence columns protected on any new asset column
- [ ] New behaviour has a test, including the failure path
- [ ] Any new Cloudinary transformation is recorded in `asset_derivatives` with `is_generative` set correctly
- [ ] Any new metric records its `model_version`
- [ ] Docs updated to match reality: `docs/architecture/api-contracts.md`, `docs/architecture/DATABASE_SCHEMA.md`
- [ ] `git grep` for secrets returns nothing
- [ ] No secret, key, or credential in any client bundle

---

## 7. Working on a Phase

**Every phase commits to its own branch. The agent never merges and never pushes — syncing `main` is the user's call.**

| Step | Command | Branch |
|---|---|---|
| 1 | `/phase N` | creates `phase/N` from `main`, implements, runs gate, leaves work **uncommitted** |
| 2 | `/commit N` | re-runs gate + audit + secrets check, then commits **on `phase/N`** |
| 3 | you sync | merge, rebase, or cherry-pick `phase/N` into `main` as you judge fit |
| 4 | you push | `git push origin phase/N`, and `main` if you synced it |

Rules that make this enforceable rather than aspirational:

- **Never implement on `main`.** A dirty tree at phase start means someone else's work is uncommitted; stop and ask.
- **Never commit on `main`.** Only `/commit` commits, and it refuses unless the branch is `phase/N`.
- **Never merge or push.** No command does either. A phase branch is handed over intact.
- **Nothing merges automatically, so check dependencies yourself.** Before building on Phase N-1, confirm its work is actually on `main`. If it is not, stop and say so. Do not silently branch from `phase/N-1` instead, and do not assume the sync will happen.
- Phase 0 predates this rule and sits directly on `main` as `d06913c`. That is the one exception.

Then, per phase:

1. Read the phase in `BUILD_ORDER.md` and confirm its dependencies are merged.
2. Implement only that phase's tasks.
3. Run the phase's gate. Do not proceed on a partial pass.
4. Mark the phase `implemented` in `BUILD_ORDER.md` — not passed. Passing is the user's call once they have reviewed the branch and the gate output.
5. If a stop condition is hit, stop and ask — do not improvise a workaround.

---

## 8. Stop Conditions

Ask before proceeding when:

- A Cloudinary transformation in the docs does not exist or behaves differently than documented.
- Secure Enclave / Keystore signing cannot be implemented. The server-side fallback must be agreed explicitly and reported as `signature_tier = 'server'`, never as device-signed.
- A sector has no trained model. Ship `unsupported`.
- A required change would mutate an existing evidence column.
- Generative AI cost or rate limits cannot be bounded before a demo.
- A schema change is needed that was not in `docs/architecture/DATABASE_SCHEMA.md`. Write the migration and document the reason.

---

*End of AGENTS.md*
