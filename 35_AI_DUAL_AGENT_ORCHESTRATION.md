# Dual-Agent Development Orchestration — V1.1

> Product baseline remains **Search Growth V1.0**. V1.1 only adds a development-control layer.

## Roles

- Codex = Controller Brain: Product Architect + Software Architect + TPM + Reviewer + QA + Acceptance.
- Claude Code + configured model = Implementation Engineer.
- Human = Product Owner / Production Authority.

## Direct orchestration path

Codex should not try to click the Claude Code VS Code sidebar. The reliable path is:

```text
Codex local agent
→ terminal
→ Claude Code CLI (`claude -p`)
→ isolated Git worktree
→ implementation/tests/DELIVERY
→ Codex independent review
```

The VS Code extension remains available for human inspection/resume, but automation uses the CLI.

If your DeepSeek configuration exists only inside the GUI extension and `claude -p` does not reach that backend, direct orchestration is not ready. Run the environment probe.

## Git topology

```text
main                    human-protected
└── integration/ai-v1   Codex-controlled
    └── ai-task/Txxx    Claude worktree branch
```

Task worktree:
`.ai-worktrees/<TASK_ID>/`

## Repository communication bus

```text
control/
├── PROJECT_STATE.md
├── DECISION_LOG.md
├── DEFECT_LEDGER.md
├── ACCEPTANCE_LEDGER.md
├── APPROVALS.json
├── AI_ENVIRONMENT_REPORT.md
├── USER_ACTION_REQUIRED.md
└── tasks/Txxx/
    ├── TASK.md
    ├── DELIVERY.md
    ├── REVIEW.md
    └── runs/
```

## Autonomous loop

Codex selects next allowed task → writes TASK → dispatches Claude → Claude implements → Codex independently verifies → PASS merges to integration or BLOCKED triggers fix → max 3 rounds → escalate.

## Auto-continue conditions

Codex may continue automatically only when:

- current task passed;
- next task is already V1.0-approved;
- no Scope/ADR conflict;
- no missing credential;
- no production side effect;
- no paid spend;
- no destructive action;
- no security exception.

## Human event gates

Human is involved only for credentials/auth, first external test-publish permission, product/ADR changes, paid spend, destructive production actions, production publish, and final MVP acceptance.

## End condition

When all V1.0 gates pass, Codex creates `control/FINAL_ACCEPTANCE_PACKET.md` and stops. Human reviews and decides whether to merge `integration/ai-v1` into `main`.

## V1.2 Windows / DeepSeek compatibility note

This machine has successfully executed:

```text
claude.cmd --version → 2.1.261
claude.cmd -p ... → EXECUTOR_OK
```

The CLI output also referenced `deepseek-v4-Pro[1m]`, so the custom model route is visible to the CLI. Bare `claude` is blocked by PowerShell because it resolves to `claude.ps1`; V1.2 orchestration therefore auto-prefers `claude.cmd`. stderr warnings are stored separately from JSON stdout.
