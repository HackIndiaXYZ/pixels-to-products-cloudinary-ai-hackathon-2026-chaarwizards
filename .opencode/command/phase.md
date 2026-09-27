---
description: Implement one BUILD_ORDER phase end to end, then update Current State
agent: phase-implementer
---

Implement **Phase $ARGUMENTS** of this project.

## Branch first — before any file is read or written

Every phase lands on its own branch. `main` is never worked on directly, and
never merged into by the agent — syncing `main` is the user's decision.

1. `git fetch origin && git checkout main && git pull --ff-only`
2. If `phase/$ARGUMENTS` already exists, check it out — you are resuming.
3. Otherwise `git checkout -b phase/$ARGUMENTS`
4. Confirm `git branch --show-current` returns `phase/$ARGUMENTS` and that
   `git status --porcelain` is empty. Stop and report if the tree is dirty:
   a phase must start from a known state, not on top of someone else's edits.

**Dependency check — this matters more than usual, because nothing merges
automatically.** Before implementing, confirm the previous phase's work is
actually present on `main`. If Phase 1 wrote `supabase/migrations/` and Phase 2
cannot see it, the user has not synced yet:

```bash
git log --oneline -20 main
ls supabase/migrations 2>/dev/null || echo "Phase 1 migrations NOT on main"
```

Stop and report if a dependency phase's work is missing from `main`. Say
plainly: "Phase N-1 is not on main yet — sync it, or tell me to branch from
`phase/N-1` instead." Do not silently rebase onto your own initiative, and do
not proceed on the assumption it will appear.

## Then implement

5. Use the `spec-reader` subagent to pull the Phase $ARGUMENTS section of
   `BUILD_ORDER.md` and whichever spec files it references. Do not read spec
   files into your own context wholesale.
6. Confirm all dependency phases have passed their gates. Check the Current
   State table at the top of `BUILD_ORDER.md` and honour any carry-over
   decisions recorded there.
7. Implement only the tasks in that phase's table. Note, do not do, work that
   belongs to a later phase.
8. Run the phase's full gate. A partial pass is a failure.
9. Update the Current State table in `BUILD_ORDER.md` to reflect the real
   outcome, and set Last updated to today. Mark the phase `implemented` and
   note the branch it is on — not passed. Passing is the user's call after
   they have reviewed the branch and the gate output.
10. Report the result, naming the branch. Do **not** commit and do **not**
    merge. `/commit` commits; syncing `main` is the user's decision.

Stop and report rather than working around any `AGENTS.md` §8 stop condition.
