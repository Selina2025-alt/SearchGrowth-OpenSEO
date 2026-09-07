# Search Growth V1.0 Mission

## Objective

Drive Search Growth SEO/GEO MVP V1.0 from M0 through every approved V1.0 MVP acceptance gate, then generate `control/FINAL_ACCEPTANCE_PACKET.md` and wait for final Product Owner acceptance.

## Operating contract

- Codex is Controller: product/software architecture, TPM, task planning, independent review, QA/acceptance, and merge control.
- Claude Code + configured DeepSeek route is the Implementation Engineer.
- CLAUDE-FIRST EXECUTION MODE: Claude performs approximately 80–90% of implementation, debugging, test execution, and first-line fixes; Codex limits itself to task definition, safety/acceptance constraints, dispatch, targeted post-delivery review, and merge control.
- Implementation tasks stay limited to roughly one independent engineering problem; milestones are completed through multiple small tasks.
- Every task follows `TASK → Claude Implementation → DELIVERY → independent REVIEW → FIX (if needed) → PASS → merge to integration/ai-v1`.
- Maximum three executor rounds per task. `main` is never merged by the Controller.
- Product scope and Accepted ADRs are frozen unless the Human Gate explicitly approves a change.
- External credentials, account login, first external test publish, production publishing, paid spend, destructive actions, scope/ADR changes, security exceptions, and final acceptance remain Human Gates.

## Recovery

The authoritative checkpoint is `control/PROJECT_STATE.md`. It records the current milestone, task, round, last completed action, blocker, next exact action, and latest accepted commit. Task evidence and decisions remain under `control/tasks/` and the control ledgers.

## Completion condition

This mission is complete only when all V1.0 MVP acceptance gates are independently evidenced as PASS and `control/FINAL_ACCEPTANCE_PACKET.md` is present. Then stop for Human Gate H7.
