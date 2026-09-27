---
description: Commit only if the phase gate and the invariant audit both pass. Use as the last step of a phase.
agent: gate-runner
---

Commit the work for Phase $ARGUMENTS — **but only if every check below passes.**

## 0. Branch precondition

Refuse unless both hold:

- current branch is `phase/$ARGUMENTS`, **not** `main`
- `git status --porcelain` is non-empty — there is something to commit

Never commit on `main`. `main` is the sync target, not a work branch. An
un-gated commit there is recoverable only with a reset, so `/commit` refuses
unless the branch is `phase/N`.

## 0.5 Task completeness — the step that catches incomplete phases

Before running any tests, enumerate **every row** of the phase's task table in
`BUILD_ORDER.md`. For each one, report a verdict:

| Verdict | Meaning |
|---|---|
| `DONE` | Implemented, and you can name the file that implements it |
| `PARTIAL` | Some of it exists. Name what is missing. |
| `MISSING` | No implementation. Name it. |
| `BLOCKED` | Cannot be checked, and say exactly what is missing (a tool, a credential, a decision) |

A task with no file behind it is `MISSING`, whatever the commit message claims.
Do not infer completion from a passing test — a gate can pass while most of a
phase is unimplemented, because the gate only tests what it names.

**Any `PARTIAL`, `MISSING`, or `BLOCKED` stops the commit.** Report the table
verbatim and stop.

## 1. Gate

Invoke the `gate-runner` subagent for Phase $ARGUMENTS.

Report a verdict for **every** gate item, individually:

| Verdict | Meaning |
|---|---|
| `PASS` | Ran it. Paste the command and its real output. |
| `FAIL` | Ran it. Paste the real failure. |
| `BLOCKED` | **Could not run.** Name the tool, credential, or decision that is missing. |

Then print the totals, e.g. `11 PASS · 0 FAIL · 2 BLOCKED`.

**The rule that matters: any `BLOCKED` item means no commit.**

Do not run a manual or device test yourself and then report it as `PASS` because
it looked fine. You cannot operate a phone or eyeball a staging deploy. Those
items are `BLOCKED (needs user review)` — every time, without exception, even if
you are confident.

Do not write "GATE PASSED" if anything is not `PASS`. Partial is not passed.
Unrun is not passed. Confident is not passed.

## 2. Invariant audit

Invoke the `invariant-auditor` subagent over all uncommitted work. Any
**critical** or **high** severity finding is a failure. Medium and low findings
are not blocking but must be reported before committing.

## 3. Secrets re-check

The audit is not a substitute for this. Run the pattern-based secrets gate
directly and confirm it is clean. Match on literal values, not variable names —
`CLOUDINARY_API_SECRET=` with nothing after it is a placeholder and is fine; the
same line with a real value after it is a leak.

If a real secret value is found in a tracked or about-to-be-committed file,
**abort** and report the file. Do not commit, and do not attempt to fix it
silently.

## 4. Commit

Only if 0, 0.5, 1, 2 and 3 all passed with nothing `PARTIAL`, `MISSING`,
`FAIL`, or `BLOCKED`:

```bash
git add -A
git commit
```

Write the message yourself. It must state **what the gate proved**, not merely
what changed. Good:

```
feat(api): add Cloudinary delivery URLs resolved by asset_id under RLS

Gate: 14/14 items PASS. pnpm lint, typecheck, test; supabase db reset;
  cross-org SELECT denied; UPDATE assets.sha256_hash raises.
Audit: no findings above medium. Clients cannot supply public_id;
  transformation allowlist rejects unknown params with 422.
```

Bad:

```
update stuff
```

The existing Phase 0 commit reads `chore(monorepo): Phase 0 scaffold — pnpm
workspace, 6 packages, TS strict, CI`. That is a change list, not a proof. For
comparison, a correct one would have read `Gate: 8/8 turbo tasks across lint,
typecheck, test; ruff, mypy, pytest green in the ml-service venv. Audit: no
findings.`

## 5. Never merge, never push

`git merge`, `git rebase`, and `git push` are forbidden here. A phase branch is
handed to the user intact; how it lands on `main` is their call.

## 6. After committing

Report the branch name and the commit SHA. Remind the user that syncing this
phase into `main` is their decision — the agent does not merge and does not
push. Nothing further happens automatically.

## 7. If anything failed, was partial, or was blocked

Do not commit. Report:

- the full verdict table, every row, including the ones that passed
- which specific item failed, was partial, or was blocked
- the real evidence — command output, not a description of it
- the likely fix, but do not apply it

Leave the work uncommitted so it can be corrected and re-gated.
