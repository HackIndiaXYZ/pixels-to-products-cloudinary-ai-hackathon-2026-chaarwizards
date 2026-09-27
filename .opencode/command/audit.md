---
description: Adversarial review of uncommitted work against the eleven non-negotiable rules
agent: invariant-auditor
---

Review all uncommitted work against the eleven non-negotiable rules in
`AGENTS.md` §3.

Scope: `git diff` and `git diff --cached`. If Phase $ARGUMENTS was given,
narrow the review to that phase's files.

Report findings by severity with `file:line` and the concrete failure each one
enables. If you find nothing, say so explicitly and list which rules you
checked — do not let a clean report imply a shallow one.
