# MVP Exit Criteria

Nine criteria, extracted from `README.md` §MVP Exit Criteria so that `BUILD_ORDER`
Phase 11 can reference something structured instead of a prose list. A gate that
cites an unstructured list cannot be verified — the list can change without the
gate noticing.

`BUILD_ORDER.md` Phase 11 gates on "all 9 criteria below pass". Each is
individually falsifiable and states how it is checked.

| # | Criterion | How it is checked | Phase that delivers it |
|---|---|---|---|
| 1 | Photo + GPS + accuracy + signature → Dashboard in under 10s | Timed capture-to-visible, measured on staging | 3, 4, 8 |
| 2 | Video (30s) + thumbnail + keyframes → Dashboard in under 15s | Timed capture-to-visible, measured on staging | 3, 4, 5, 8 |
| 3 | Search 1 000 assets by tag, location, date, GPS accuracy, or asset type in under 500ms | `EXPLAIN ANALYZE` on a 1 000-row seeded set; every filter path timed | 8 |
| 4 | 5 photo pairs + 3 video pairs → real metrics + diff images and video | Seeded end-to-end run; metrics carry a `model_version` and match the model registry | 6, 7, 9 |
| 5 | Sub-project hierarchy works in the capture app picker | Device test: nested project is selectable and its observations_type routes correctly | 4, 8 |
| 6 | A single project with 3 observation types routes to the correct ML models | Each `observation_type` hits its registry key; an unregistered type returns `unsupported`, never another sector's model (§3.3) | 2, 6 |
| 7 | Forestry donor report PDF with integrity appendix and video clips | Generated report opened; manifest re-verified against Postgres by `sha256` | 9 |
| 8 | Manual audit verification passes in under 5 minutes | Timed walkthrough by someone who did not build the report | 10 |
| 9 | All 4 services deploy independently from `main` | Clean-room deploy of each service from the merged branch; no shared build step | 11 |

## Rules for using this file

- **All nine or none.** A passing Phase 11 means nine `PASS` marks here. Eight is
  a failure, not a near-miss.
- **Criterion 1, 2, 3, 5, 8, and 9 need a human.** They are timing, device, or
  deployment judgements. They are reported as `BLOCKED (needs user review)` by the
  agent and cannot be self-certified. See `AGENTS.md` §7.
- **Criterion 4 has a hard sub-clause.** "Real metrics" means each number resolves
  to a `model_registry` version. A number with no `model_version` fails this
  criterion outright, regardless of how plausible it looks (§3.2).
- **Criterion 6 must include a negative case.** Proving the three types route
  correctly is half the test. An unregistered type must return
  `{"status": "unsupported"}` — never a fallback to a different sector's model.

## Traceability

`README.md` §MVP Exit Criteria is the human-facing version. This file is the
gate-facing version. If they disagree, this file wins, because the gate reads
this one — but the disagreement is a bug in one of them and should be fixed, not
papered over.
