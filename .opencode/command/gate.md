---
description: Verify the current phase's gate, secrets, and Definition of Done
agent: gate-runner
---

Run the full gate for Phase $ARGUMENTS.

Report every check separately — pass or fail — then one line stating whether
the gate passed. If anything failed, give the fix but do not apply it.

Also confirm the Current State table in `BUILD_ORDER.md` matches reality. If it
claims a gate passed that this run shows failing, say so plainly.
