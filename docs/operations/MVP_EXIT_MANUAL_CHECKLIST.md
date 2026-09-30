# MVP Exit — Manual / Staging Checklist

Five of the nine criteria in [`../architecture/MVP_EXIT_CRITERIA.md`](../architecture/MVP_EXIT_CRITERIA.md)
— **1, 2, 5, 8, 9** — cannot be certified by an automated test or by an AI agent.
They are timing, device, or deployment judgements that require a human on real
hardware or a real staging environment. Per **AGENTS.md §7.1**, an agent reports
each of these as `BLOCKED (needs user review)`, and they **block `/commit`** until
the user runs them and records the evidence below.

The other four criteria (3, 4, 6, and the automatable parts) have automated,
repeatable coverage on `phase/11`:

| # | Criterion | Automated coverage |
|---|---|---|
| 3 | Search 1 000 assets under 500 ms | `apps/api/src/routes/search-perf.integration.test.ts` — seeds 1 000 rows, asserts an index scan (not seq scan) on every filter path; wall-clock logged, staging still required for the <500 ms number (see criterion 3 below) |
| 4 | 5 photo + 3 video pairs → real metrics + diff | `apps/ml-service/tests/test_exit_criterion_4.py` — every metric carries a `model_version` that resolves to a trained `model_registry` row (§3.2) |
| 6 | 3 observation types route correctly + unsupported | `apps/ml-service/tests/test_exit_criterion_6.py` — each type routes to its own registry key; unregistered → `{"status":"unsupported"}`, never a fallback (§3.3) |

> **Why an agent cannot self-certify 1, 2, 5, 8, 9.** AGENTS.md §7.1: "Manual
> checks are never self-certified. Device tests, staging deploys, realtime
> behaviour, timed audits, and anything needing a human with a phone … An agent
> reports them `BLOCKED (needs user review)`, every time, without exception." A
> stopwatch reading, a physical device, or a live deploy is evidence the agent
> has no access to; asserting a pass on faith would be exactly the false pass the
> rule forbids.

---

## Criterion 1 — Photo + GPS + accuracy + signature → Dashboard in under 10 s
**Status:** `BLOCKED (needs user review)`

- **How to verify:** On a physical phone running the capture app against a
  **staging** API + Cloudinary + Supabase, capture one geo-tagged photo. Start a
  stopwatch at shutter release; stop it when the asset is visible (verified) in
  the dashboard. Repeat 3–5 times and take the worst case.
- **Evidence to capture:** the timings (each run), the staging commit SHA, a
  screenshot of the asset in the dashboard with its integrity panel `pass`.
- **Pass bar:** worst-case capture-to-visible **< 10 s**.
- **Why not automatable:** needs a real device camera, real GPS, real network
  latency, and a wall-clock — none available to the agent (§7.1).

## Criterion 2 — Video (30 s) + thumbnail + keyframes → Dashboard in under 15 s
**Status:** `BLOCKED (needs user review)`

- **How to verify:** On a physical phone against staging, capture a 30 s video.
  Time from stop-recording to the clip (with thumbnail + extracted keyframes)
  being visible in the dashboard.
- **Evidence to capture:** timings, the staging SHA, a screenshot showing the
  thumbnail and keyframe posters in the dashboard.
- **Pass bar:** capture-to-visible **< 15 s**.
- **Why not automatable:** device capture, ffmpeg keyframe extraction on the
  server, and a wall-clock measurement (§7.1).

## Criterion 5 — Sub-project hierarchy works in the capture-app picker
**Status:** `BLOCKED (needs user review)`

- **How to verify:** On the device, open the project picker, drill into a nested
  sub-project, and confirm it is selectable and that its `observation_type`
  options are inherited/routed correctly for capture.
- **Evidence to capture:** a screen recording or screenshots of the nested
  picker selection, and one capture filed under the sub-project visible in the
  dashboard under the correct parent.
- **Pass bar:** the nested project is selectable and its observation types route
  correctly.
- **Why not automatable:** requires the Expo app running on a device with the
  native picker UI (§7.1); the capture-app unit tests cover the picker logic but
  not the on-device binding.

## Criterion 8 — Manual audit verification passes in under 5 minutes
**Status:** `BLOCKED (needs user review)`

- **How to verify:** Hand a generated forestry donor report to someone who did
  **not** build it. Have them use the integrity viewer / verification receipt to
  confirm the hash chain, per-asset signatures, and manifest sha256s, timing the
  walkthrough.
- **Evidence to capture:** the auditor's name/role (must be an independent
  party), the elapsed time, and the verdict per section.
- **Pass bar:** an independent auditor completes verification in **< 5 min** with
  every check green.
- **Why not automatable:** requires an independent human auditor and a stopwatch;
  the agent both built the artifact and cannot time a person (§7.1). The chain /
  receipt logic itself is covered by Phase 10 tests + pgTAP `07_chain_verification`.

## Criterion 9 — All 4 services deploy independently from `main`
**Status:** `BLOCKED (needs user review)`

- **How to verify:** From a **clean checkout of `main`**, deploy each of the four
  services (api → Railway/Fly, ml-service → Fly, dashboard → Vercel, capture-app →
  EAS build) on its own, with no shared build step, and confirm each comes up
  healthy independently.
- **Evidence to capture:** the four deploy URLs / build IDs, each service's
  health check green, and confirmation that no service's deploy depended on
  another's build artifacts.
- **Pass bar:** all four deploy and run independently from the merged branch.
- **Why not automatable:** requires real platform credentials and live deploys
  (§7.1). The per-service CI jobs in `.github/workflows/ci.yml` prove each service
  **builds** in isolation; the **deploy** half is this item.

---

## Sign-off

Mark a criterion `PASS` only after pasting its evidence here. All five must be
`PASS` (with 3, 4, 6 green in CI) before Phase 11's gate is complete — eight of
nine is a failure, not a near-miss (`MVP_EXIT_CRITERIA.md`).

| # | Verifier | Date | Evidence link | Verdict |
|---|---|---|---|---|
| 1 | | | | ☐ |
| 2 | | | | ☐ |
| 5 | | | | ☐ |
| 8 | | | | ☐ |
| 9 | | | | ☐ |
