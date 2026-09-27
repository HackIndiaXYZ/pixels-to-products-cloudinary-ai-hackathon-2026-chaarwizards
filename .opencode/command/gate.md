---
description: Verify the current phase's gate, secrets, and Definition of Done
agent: gate-runner
---

Run the full gate for Phase $ARGUMENTS.

## Report format

Produce a table, one row per gate item, and print totals beneath it. Never
collapse it into "gate passed" with no per-item evidence.

| # | Gate item | Verdict | Evidence |
|---|---|---|---|
| 1 | `supabase db reset` succeeds | PASS | `11 migrations applied` |
| 2 | cross-org SELECT denied | PASS | `ERROR: new row violates row-level security policy` |
| 3 | device test: airplane mode | **BLOCKED** | needs user review — agent cannot operate a device |

Totals line, e.g. `11 PASS · 0 FAIL · 2 BLOCKED`.

## The three verdicts

- `PASS` — you ran it. Paste the command and its real output.
- `FAIL` — you ran it. Paste the real failure output.
- `BLOCKED` — you could not run it. Name what is missing: a tool, a
  credential, a device, a staging environment, or a decision from the user.

**A `BLOCKED` item is not a `PASS`.** Gate items listed in a phase's
`### Deferred to user review` section are *always* `BLOCKED` — they need a human
with a phone or a deployed environment. Never self-certify one, however obvious
it looks.

If anything failed, give the fix but do not apply it.

## Task completeness

Separately from the gate items, list every row of the phase's task table in
`BUILD_ORDER.md` with `DONE` / `PARTIAL` / `MISSING` / `BLOCKED`, and name the
file that implements each `DONE`. A passing gate does not imply a complete
phase — a gate only tests what it names.

## Consistency check

Confirm the Current State table in `BUILD_ORDER.md` matches reality. If it
claims a gate passed that this run shows failing, say so plainly. Do not edit the
table to match the run — that is the user's call.
