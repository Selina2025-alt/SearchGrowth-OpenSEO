# AI Environment Setup

## Best topology

Windows/WSL machine with:

- Git repo
- Codex Local (CLI/IDE/desktop local mode)
- Claude Code CLI
- VS Code Claude Code extension
- same filesystem

Codex Cloud/Web alone cannot directly operate a local VS Code extension. Direct orchestration requires a local Codex process that can execute the local `claude` command in the repo.

## Probe

Run from repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .ai-orchestrator\probe-environment.ps1
```

It creates `control/AI_ENVIRONMENT_REPORT.md` and never records secret values.

Direct mode requires:

- git repo found
- Claude CLI found
- `claude --version` works
- `claude -p` health probe succeeds
- task worktree can be created

## DeepSeek-backed Claude Code

A VS Code extension using DeepSeek does not prove the Claude CLI uses the same backend. The CLI probe is the decisive check.

If direct mode fails, fix PATH/CLI/backend configuration or run Codex locally. Do not automate the VS Code UI as a workaround.

## V1.2 Windows / DeepSeek compatibility note

This machine has successfully executed:

```text
claude.cmd --version → 2.1.261
claude.cmd -p ... → EXECUTOR_OK
```

The CLI output also referenced `deepseek-v4-Pro[1m]`, so the custom model route is visible to the CLI. Bare `claude` is blocked by PowerShell because it resolves to `claude.ps1`; V1.2 orchestration therefore auto-prefers `claude.cmd`. stderr warnings are stored separately from JSON stdout.
