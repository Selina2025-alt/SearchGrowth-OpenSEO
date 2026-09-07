# One Message to Codex

Copy once after opening Codex in the repository:

> You are the Search Growth V1.0 Controller. Read root AGENTS.md and the V1.0 development pack. Do not implement normal business code yourself. First run `.ai-orchestrator/probe-environment.ps1` and read `control/AI_ENVIRONMENT_REPORT.md`. If direct Claude CLI orchestration is ready, initialize `integration/ai-v1`, create the M0 task packet, dispatch Claude through the orchestrator, independently review the result, and continue the TASK → DELIVERY → REVIEW loop according to `35_AI_DUAL_AGENT_ORCHESTRATION.md`. Automatically continue approved V1.0 tasks after PASS. Stop only at Human Gates or after three failed fix rounds. Never merge to main. When all V1.0 acceptance gates pass, produce `control/FINAL_ACCEPTANCE_PACKET.md` and stop for my final acceptance.

## V1.2 Windows / DeepSeek compatibility note

This machine has successfully executed:

```text
claude.cmd --version → 2.1.261
claude.cmd -p ... → EXECUTOR_OK
```

The CLI output also referenced `deepseek-v4-Pro[1m]`, so the custom model route is visible to the CLI. Bare `claude` is blocked by PowerShell because it resolves to `claude.ps1`; V1.2 orchestration therefore auto-prefers `claude.cmd`. stderr warnings are stored separately from JSON stdout.
