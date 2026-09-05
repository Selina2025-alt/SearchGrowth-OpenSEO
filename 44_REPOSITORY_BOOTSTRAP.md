# Repository Bootstrap

## Important
The development pack is a specification/control package, not the OpenSEO source repository by itself.

For direct dual-agent operation, the **actual OpenSEO fork repository** must contain:
- the V1.0 devpack docs;
- root `AGENTS.md`;
- root `CLAUDE.md`;
- `.ai-orchestrator/`;
- `control/`.

## Recommended first-time setup

1. Create or clone the company OpenSEO fork.
2. Checkout the frozen V1.0 base defined in `04_OPENSEO_REUSE_CODE_MAP.md`.
3. Copy this development pack into the repo root, preserving root `AGENTS.md` and `CLAUDE.md`.
4. Do not overwrite real source files with any reference schema; they are design references until M0 maps them to actual OpenSEO conventions.
5. Open **local Codex** in this repository.
6. Send only the message in `40_ONE_MESSAGE_TO_CODEX.md`.

Codex should then run the environment probe and take over M0/M0.5.

## If you do not yet have a fork

Codex may perform the clone/bootstrap during M0 if:
- it is running locally;
- network/Git access is allowed;
- no paid/destructive action is required.

If GitHub write authentication is missing, cloning the public upstream is still possible, but pushing/creating private remotes becomes Human Gate H1.

## Control baseline commit

Before the first Claude task, Codex should create/verify `integration/ai-v1` and ensure the development-control files are available from that integration branch.

This ensures every task worktree automatically receives the same AGENTS/CLAUDE/spec context.

## Do not
- start autonomous work in a folder containing only the ZIP and no source repository;
- let Codex Cloud assume it can control a local VS Code extension;
- copy reference migration SQL directly into production without M0 mapping.

## V1.2.1 one-click recovery

If you currently have only the development-pack folder and no OpenSEO source, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-openseo-windows.ps1
```

Then open the generated `SearchGrowth-OpenSEO` repository. Do not continue M0 in the docs-only folder.

