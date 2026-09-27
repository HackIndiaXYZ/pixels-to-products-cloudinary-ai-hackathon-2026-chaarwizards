---
description: Commit only if the phase gate and the invariant audit both pass. Use as the last step of a phase.
agent: gate-runner
---

Commit the work for Phase $ARGUMENTS — **but only if every check below passes.**

## 0. Branch precondition

Refuse unless both hold:

- current branch is `phase/$ARGUMENTS`, **not** `main`
- `git status --porcelain` is non-empty — there is something to commit

## Never merge, never push

`git merge`, `git rebase`, and `git push` are forbidden here. A phase branch is
handed to the user intact; how it lands on `main` is their call.

## Never commit on `main`

`main` is the sync target, not a work branch. An un-gated commit there is
recoverable only with a reset, so `/commit` refuses unless the branch is
`phase/N`.

Run these in order. Stop at the first failure.

## 1. Gate

Invoke the `gate-runner` subagent for Phase $ARGUMENTS. It must report
**GATE PASSED**. Any single failing check counts as a failure.

## 2. Invariant audit

Invoke the `invariant-auditor` subagent over all uncommitted work. Any
**critical** or **high** severity finding is a failure. Medium and low
findings are not blocking but must be reported before committing.

## 3. Secrets re-check

The audit is not a substitute for this. Run the pattern-based secrets gate
directly and confirm it is clean. If a real secret value is found in a tracked
or about-to-be-committed file, **abort** and report the file — do not commit,
and do not attempt to fix it silently.

## 4. Commit

Only if steps 1–3 all passed:

```bash
git add -A
git commit
```

Write the message yourself. It must state **what the gate proved**, not merely
what changed. Good:

```
feat(api): add Cloudinary delivery URLs resolved by asset_id under RLS

Gate: pnpm lint, typecheck, test pass; turbo build green.
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

Do not push. Pushing is the user's decision, always.

## 5. After committing

Report the branch name and the commit SHA. Remind the user that syncing this
phase into `main` is their decision — the agent does not merge and does not
push. Nothing further happens automatically.

## 5. If anything failed

Do not commit. Report:

- which check failed
- the specific evidence
- the fix, but do not apply it

Leave the work uncommitted so it can be corrected and re-gated.
