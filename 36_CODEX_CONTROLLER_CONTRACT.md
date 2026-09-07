# Codex Controller Contract

Per task:

1. update PROJECT_STATE;
2. create TASK.md;
3. dispatch Claude via `.ai-orchestrator/dispatch-claude.ps1`;
4. inspect executor worktree and DELIVERY;
5. independently run validation;
6. write REVIEW;
7. if BLOCKED run `.ai-orchestrator/dispatch-fix.ps1`;
8. max 3 total executor rounds;
9. PASS → merge task branch to `integration/ai-v1`;
10. continue unless Human Gate.

Review verdicts:

- PASS
- PASS_WITH_NON_BLOCKERS
- BLOCKED

PASS_WITH_NON_BLOCKERS may merge only when remaining issues are MINOR/NIT and entered into DEFECT_LEDGER.

Controller should not normally write implementation code. Control/orchestration docs are Controller-owned.

Human escalation format:
WHY STOPPED / WHAT IS NEEDED / WHERE TO GET IT / EXACT ACTION / RISK / WHAT HAPPENS NEXT.
