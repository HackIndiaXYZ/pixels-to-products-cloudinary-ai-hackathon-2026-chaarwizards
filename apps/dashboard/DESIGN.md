# Panchnama AI Console — Design & Data Contract

This document is the handover contract for the console: what each screen is made of, which
Postgres column or RPC each figure comes from, and the rules that keep the interface honest.

---

## 1. Run it

```bash
npm install
npm run dev          # http://localhost:5173  — Vite dev server, live Supabase reads
```

Other commands:

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` under the strict configuration in `tsconfig.json` |
| `npm run build` | typecheck, then production bundle into `dist/` |
| `npm run preview` | serve the built bundle on http://localhost:4173 |

There is exactly one root HTML file, `index.html`. It is the Vite entry **and** the review harness:

| URL | What renders |
| --- | --- |
| `/` or `/#/` | the live application, behind the session gate |
| `/?state=loading` | the boundary in its loading state |
| `/?state=empty` | a query that succeeded and returned nothing |
| `/?state=error` | a failed read with a retry |
| `/?state=unauthorized` | a read refused by row-level security |
| `/?state=unknown` | a value the backend could not determine |
| `/?state=ready` | the live application again — never a fixture |

Every `?state=` URL bypasses the session gate on purpose: `src/main.tsx` renders the harness
outside `<App />`, so the review gallery stays reachable without signing in.

Routing is hash-based so the bundle works from a static host with no rewrite rules.
`/projects/:projectId/assets/:assetId` is the shareable address of an open evidence drawer.

### Environment

| Variable | Required | Meaning |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | yes | anon or publishable key **only** |
| `VITE_API_URL` | for media | base URL of the authenticated API routes; trailing slashes are ignored and local Vite dev server proxies `/api` to it. `VITE_PANCHNAMA_API_BASE` remains a supported alias |
| `VITE_SATELLITE_TILE_URL` | no | raster tile template; absent ⇒ satellite control stays disabled |

Without a backend the console still renders honestly, in two distinct ways:

- **No Supabase URL/anon key** — the sign-in screen refuses explicitly and withholds the form,
  naming the two missing variables. Nothing appears to succeed.
- **Supabase present, no session** — the login screen. Once signed in, every service returns a
  typed `DataState`, so a missing table or refused row reads as an honest refusal rather than
  fabricated data.

---

## 2. Visual system — Warm Enterprise Evidence Console

The surfaces are light and quiet: a warm off-white page, white cards separated by subtle warm
borders, and soft low-opacity shadows for elevation. Type is dark charcoal. The intent is a records
console that can sit in front of a photograph or a map without competing with it.

**Tokens live in `src/styles/tokens.css`; every component reads them from there.** No colour is
written directly in `components.css` except one intentional white halo on the photo comparison
slider, which has to stay visible over arbitrary imagery.

| Role | Token | Use |
| --- | --- | --- |
| Type | Sora | headings, labels, body |
| Type | JetBrains Mono | hashes, ids, coordinates, timestamps |
| Page | `--pn-ground` | warm off-white app background |
| Cards | `--pn-surface`, `--pn-surface-sunken` | card / inset |
| Interaction | `--pn-hover`, `--pn-active` | nav and button rest states |
| Ink | `--pn-text`, `--pn-text-muted`, `--pn-text-faint` | primary, secondary, muted |
| Line | `--pn-line`, `--pn-line-strong` | borders |
| Accent | `--pn-accent` | the one interactive colour; focus ring, primary button |
| Verified | `--pn-pass` | green — verification passed |
| In flight | `--pn-info` | cobalt — pending, syncing |
| Attention | `--pn-warn` | amber — flagged, partial |
| Failure | `--pn-fail` | muted red — failed |
| Cannot determine | `--pn-unknown` | grey — unknown, unavailable, unsupported |

Every signal ships as a **five-part set** — base, text, tint fill, border, and focus ring — so a
badge and a note express the same meaning without either hardcoding a hue:

```css
--pn-pass / --pn-pass-text / --pn-pass-tint / --pn-pass-line / --pn-ring-pass
```

Over surfaces that sit **on imagery** (map toolbar, map legend, photo slider labels) the skin uses
one extra set rather than reusing card tokens: `--pn-map-panel`, `--pn-map-cover`, `--pn-media-chip`.
A translucent white panel keeps charcoal text readable over satellite tiles, where a card token
would be unreadable.

Rules the CSS enforces:

- **Light only.** There is no dark theme and no `prefers-color-scheme` branch; the token layer
  declares `color-scheme: light` so native controls and scrollbars match.
- **Borders and soft shadow, not heavy elevation.** Shadow is warm-tinted and low-opacity; there is
  no glassmorphism and no inner clay texture (the `--pn-clay*` names are retained for compatibility
  and are now a one-pixel top highlight plus a warm bottom shade).
- **Colour is never the only signal.** Every status badge carries its own text and an outlined glyph.
- **`pn-visually-hidden` for status text**, so screen readers hear filter and drawer changes.
- **`prefers-reduced-motion` respected**, keyboard focus always visible via `--pn-focus-ring`.

---

## 3. Authentication

`App` is a gate, not a shell. `useAuthSession()` resolves identity before any workspace query is
allowed to mount, so an unauthenticated visitor never triggers an RLS-denied request and never sees
shell chrome.

```
useAuthSession() → loading    → gate screen, "Checking your session"
                → error      → gate screen + reload, no shell
                → unconfigured → sign-in screen, form withheld
                → anonymous   → LoginPage
                → ready      → WorkspaceShell
```

`WorkspaceShell` is a separate component that mounts and unmounts as a unit. This is deliberate: an
early `return` inside `App` above those hooks would change the hook count between renders and throw
at runtime.

**Sign-in is password only** (`signInWithPassword`). There is no signup, password reset, OTP, or
magic-link path, because organisation membership is provisioned server-side by a `platform_admin`.
The login screen says so, rather than offering links that do not exist.

| Concern | Rule |
| --- | --- |
| Password lifetime | held in `LoginPage` submit state only; never stored, logged, put in a URL or query key, or sent anywhere except Supabase |
| Failure copy | mapped to non-enumerating wording; a wrong email and a wrong password are indistinguishable |
| Unconfigured build | refuses explicitly and withholds the form — an inert form would read as a working one |
| Sign-out | `signOut()`; the gate re-mounts the shell only after the auth event reports no session |
| Role | still the hoisted `app_role` JWT claim. The login form never sends a role or an `org_id` |

Identity flows one way: **session → JWT claims → RLS**. Nothing in the client is authoritative about
who the caller is.

The `?state=` harness is rendered by `src/main.tsx` *outside* `App`, so it stays reachable with no
session for review purposes.

---

## 4. Architecture

```
src/
  types/database.ts        generated-style schema, RPC signatures, vocabularies
  lib/state.ts             DataState<T>, Field<T>, canonical copy constants
  lib/supabase/client.ts   the only file that touches the SDK; returns DataState, never throws
  lib/queries/*.ts         one service per domain, all returning DataState<T>
  lib/models.ts            row → view model; the place honest defaults live
  lib/media.ts             Cloudinary transformations via @cloudinary/url-gen
  hooks/useAuthSession.ts  session lifecycle: unconfigured/loading/anonymous/ready/error
  hooks/*.ts               useQuery wrappers that hand components a DataState
  components/*.ts          database-driven components that accept a DataState
  features/auth/           LoginPage — the sign-in screen
  features/*/              the five screens
  harness/ReviewHarness.tsx  the ?state= gallery
```

Two rules make the honesty guarantees structural rather than aspirational:

1. **Services return `DataState<T>`, never raw data.** `loading | error | unauthorized | empty |
   unknown | ready` are all reachable states of the type, so a screen cannot quietly skip one.
2. **`DataBoundary` is the only place a `DataState` becomes markup.** Every database-driven
   component passes through it, so loading, refusal, emptiness, and indeterminacy cannot be
   forgotten at the call site.

`Field<T>` distinguishes a NULL column (`unknown` — the backend cannot determine it) from a field
the query never returned (`unavailable`). Both render as a word, never as zero.

---

## 5. Field → UI provenance

Every figure on screen names its source. Nothing is computed from something that does not exist.

| UI element | Source | Rule |
| --- | --- | --- |
| Total evidence assets | `search_assets` `Content-Range` | exact count; never client-counted |
| Authenticity verified rate | `assets.verification` buckets | `passed / total`; `pending`/`unknown` are not passes |
| Paired change events | `change_events` | only when **both** asset ids are non-null |
| Quarantine review items | `assets.quarantined_at IS NOT NULL` | there is no quarantine table |
| Integrity badge | `asset_integrity` RPC booleans | NULL ⇒ `unknown` ⇒ "Cannot determine" |
| Audit chain | `verify_audit_chain` | result reported as returned |
| Clock drift / GPS provider | `asset_integrity` | NULL ⇒ `Unknown` |
| Evidence grid + map | `search_assets` | all filtering, facets, pagination on the server |
| Map markers | `assets.gps_point` | never approximated; no fix ⇒ not on the map |
| Project waypoints on the map | `projects.geometry` centroid | polygon centroid only; unreadable geometry ⇒ no tag, and the count of unplaced projects is stated beside the map |
| Project asset count in the map card | `assets.project_id` `Content-Range` | exact count read per open card, not per project on the map; the current page length is never reused as a total |
| Media | `/v1/assets/media?asset_id=` | resolves under RLS, transformed by public id |
| Before/after compare | `change_events.before_asset_id` / `after_asset_id` | unpaired ⇒ explained, not faked |
| Change metrics | `change_events.change_metrics` (JSONB) | keys as found; net delta only when both sides are numeric |
| Model provenance | `model_registry` | only `forestry` is registered as trained; every other sector reads `Unsupported for this sector` |
| Model weights | `model_registry.weights_uri` | NULL even for the placeholder ⇒ `Unavailable` |
| Evidence package | `evidence_packages` | this **is** the report record; there is no `reports` table |
| Manifest SHA-256 | `report_manifest_entries.sha256_hash` | byte-exact, monospace, never abbreviated |
| Report templates | `report_templates` | empty ⇒ "No report templates available." |
| Workspace name | `orgs` row for the `org_id` claim | never from the request body |
| System status | `sync_state.last_status` | `Never synced` when `last_run_at` is NULL |
| Identity / role | Supabase session + hoisted `app_role` claim | `role` is a reserved claim and is never read |
| Activity stream | `audit_log` (+ realtime on that table) | rows carry their own `asset_id`, `target_type` |

### Copy rules

- **Verification ≠ integrity ≠ upload status.** Three separate vocabularies, three separate badges.
- **NULL never becomes pass, zero, or empty.** `Unknown` for indeterminate, `Unavailable` for absent,
  `No … found` for a query that genuinely returned nothing.
- **No invented reason.** Quarantine has no stored reason, so the UI says `Reason unavailable`
  unless an integrity check actually failed.
- **No invented numbers.** Unregistered sector metrics, empty registry metrics, and missing weights
  read as unknown. Nothing is borrowed from another sector.
- **A NULL GPS fix is excluded from the map, not hidden.** The grid keeps the row and says so.
- **A project with no geotagged asset still has a waypoint.** Tags come from `projects.geometry`, not
  from asset positions, so the two layers are never confused for each other.
- **A project tag opens its own count.** The number is a real `assets` row count under RLS. While it
  loads, or if the read fails, the card says so rather than showing a figure it does not have.

---

## 6. Security boundaries

- **Browser = anon key only.** `src/lib/supabase/client.ts` refuses a key containing
  `service_role` or `sb_secret_` at runtime. Supabase only exposes `VITE_`-prefixed values, so a
  service-role credential cannot reach the bundle.
- **Row-level security is the authorisation.** The UI never filters by `org_id` for access control;
  `org_id` is a JWT claim. Hiding a control is presentation, not authorisation.
- **`crypto_inputs` never leaves the API route.** The database strips it; the browser never sees or
  requests it.
- **Media is fetched by `asset_id`, never by `public_id`.** The client cannot construct another
  organisation's media URL; the API resolves it under the caller's session and returns a
  Cloudinary transformation.
- **Client-side filtering is prohibited.** `search_assets` has no project parameter, so project is
  not offered as an evidence filter — a filter the server cannot honour would be a lie.

---

## 7. Known limits, stated plainly

- `search_assets` caps results; when it truncates, the UI says how many matched in total.
- GPS-accuracy filtering excludes assets whose accuracy is NULL. The UI states this under the filter.
- The satellite basemap is disabled unless a tile template is configured; the Street basemap is
  OpenStreetMap raster tiles.
- `change_metrics` is opaque JSONB — no metric shape is assumed, and an unreadable value reads `Unknown`.
- Project waypoints read GeoJSON (object or JSON string) from `projects.geometry`. WKT text is not
  parsed; such a row gets no tag and is reported as unplaced rather than being guessed at.
- The map runtime is imported on demand; if it cannot load, the map explains itself and the rest of
  the screen keeps working.
- Verification receipts are a live re-run, not a stored snapshot.