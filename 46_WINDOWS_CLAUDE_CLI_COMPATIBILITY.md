# Windows Claude CLI Compatibility — V1.2

Observed on the actual development machine:

```text
claude.cmd --version
→ 2.1.261 (Claude Code)

claude.cmd -p "只回复 EXECUTOR_OK" --output-format text --max-turns 1
→ warning mentioning model "deepseek-v4-Pro[1m]"
→ EXECUTOR_OK
```

## Interpretation

- Claude Code CLI is installed.
- Non-interactive `-p` mode works.
- The CLI sees the custom DeepSeek model routing metadata.
- `[claude-code:unrecognized_model] ... query_source:"generate_session_title"` is non-fatal in this test: the actual executor response succeeds.

## PowerShell behavior

Bare `claude` resolves to npm-generated `claude.ps1`, which is blocked by the machine's PowerShell Execution Policy.

`claude.cmd` works without lowering the machine-wide policy.

Therefore V1.2:
- prefers `claude.cmd` on Windows;
- falls back to `claude.exe` / `claude`;
- does not require machine-wide execution-policy changes.

## stdout/stderr

Custom-model integrations may emit warnings on stderr.
V1.2 stores stdout and stderr separately so warnings do not corrupt JSON output.

A warning alone is not a failed executor run. A non-zero exit, missing DELIVERY, failed tests, or failed Controller review remains a failure.

## Current technical path

```text
Codex Local
→ PowerShell
→ claude.cmd -p
→ DeepSeek-backed Claude Code
→ task worktree
→ DELIVERY
→ Codex independent review
```

Next verification: Codex itself must have local shell access to the same repository.
