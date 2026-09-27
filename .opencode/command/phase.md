---
description: Implement one BUILD_ORDER phase end to end, then update Current State
agent: phase-implementer
---

Implement **Phase $ARGUMENTS** of this project.

## Branch first — before any file is read or written

Every phase lands on its own branch. `main` is never worked on directly, and
never merged into by the agent — syncing `main` is the user's decision.

1. `git fetch origin && git checkout main && git pull --ff-only`
2. Determine whether this is a fresh start or a resume:
   - `phase/$ARGUMENTS` does not exist → fresh. `git checkout -b phase/$ARGUMENTS`
   - `phase/$ARGUMENTS` exists and the tree is clean → resume, just check it out
   - `phase/$ARGUMENTS` exists and the tree is **dirty** → you are resuming an
     interrupted run. Check out the branch, report which files are already
     modified or untracked, and **continue from there**. Do not reset, stash,
     or discard that work — it is the previous attempt at this same phase.
   - tree is dirty while on `main` or another branch → stop and report. That is
     someone else's work and is not yours to adopt or discard.
3. Confirm `git branch --show-current` returns `phase/$ARGUMENTS`.

## Dependency check — matters more than usual, because nothing merges automatically

Before building on the previous phase, confirm its work is actually present.
If Phase 1 wrote `supabase/migrations/` and Phase 2 cannot see it, the user has
not synced yet:

```bash
ls supabase/migrations 2>/dev/null || echo "Phase 1 migrations NOT here"
```

Stop and report if a dependency phase's work is missing. Say plainly: "Phase
N-1 is not on this branch yet — sync it, or tell me to branch from `phase/N-1`."
Do not silently rebase onto your own initiative, and do not proceed assuming the
sync will happen.

## Then implement

4. Use the `spec-reader` subagent to pull the Phase $ARGUMENTS section of
   `BUILD_ORDER.md` and whichever spec files it references. Do not read spec
   files into your own context wholesale.
5. Read the Current State table at the top of `BUILD_ORDER.md` and honour any
   carry-over decisions recorded there.
6. Implement only the tasks in that phase's table. Note, do not do, work that
   belongs to a later phase. On a resume, verify what already exists before
   writing it again.
7. Run the phase's full gate. A partial pass is a failure. Report a verdict for
   every gate item — `PASS`, `FAIL`, or `BLOCKED` — and print the totals. If the
   gate cannot run because a tool is missing, say which tool and give the install
   command. Do not report the phase as gated on a partial run, and do not mark a
   manual or device test `PASS` on your own judgement: those are always
   `BLOCKED (needs user review)`.
8. Update the Current State table in `BUILD_ORDER.md` to reflect the real
   outcome, and set Last updated to today. Mark the phase `implemented` and
   note the branch it is on — not passed. Passing is the user's call after
   they have reviewed the branch and the gate output.
9. Report the result, naming the branch. Do **not** commit and do **not**
   merge. `/commit` commits; syncing `main` is the user's decision.

Stop and report rather than working around any `AGENTS.md` §8 stop condition.
