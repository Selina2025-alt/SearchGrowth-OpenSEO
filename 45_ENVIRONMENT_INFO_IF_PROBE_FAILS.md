# If Direct Mode Fails: What Information to Provide

You do not need to search settings manually first.

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .ai-orchestrator\probe-environment.ps1
```

Then provide:
`control/AI_ENVIRONMENT_REPORT.md`

If additional diagnosis is needed, provide only these non-secret outputs:

```powershell
codex --version
where.exe codex

claude --version
where.exe claude

claude doctor

code --list-extensions --show-versions | findstr /I "claude anthropic deepseek codex openai"

git rev-parse --show-toplevel
git status --short
```

To test whether CLI uses the configured backend:

```powershell
claude -p "只回复 EXECUTOR_OK" --output-format text --max-turns 1
```

For environment configuration, provide **variable names only**, never values:

```powershell
Get-ChildItem Env: |
  Where-Object { $_.Name -match 'ANTHROPIC|CLAUDE|DEEPSEEK|OPENAI' } |
  Select-Object Name
```

Also tell the architect:

- Are you using Codex CLI, Codex IDE extension, ChatGPT desktop Codex local mode, or Codex web/cloud?
- Is Claude Code the official Anthropic extension/CLI or another VS Code extension?
- Does the VS Code extension and CLI share the same DeepSeek configuration?

Never send API keys, tokens, cookies, or password values.
