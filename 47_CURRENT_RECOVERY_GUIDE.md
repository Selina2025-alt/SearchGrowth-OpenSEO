# Current Recovery Guide — From docs-only folder to real development repo

## What happened

The current `0905 Search Growth SEO GEO MVP` folder is a **development-pack folder**, not the OpenSEO source repository.

That is why Codex correctly stopped at H0:

- no `.git`;
- no OpenSEO `src/`;
- no `package.json` / `pnpm-lock.yaml`;
- therefore M0 cannot begin.

A previous orchestration ZIP also accidentally omitted several support directories from the complete V1.0 baseline (`docs/adr`, `schemas`, `skills`, `templates`, `fixtures`, `reference-implementations`, `checklists`). V1.2.1 fixes that packaging regression.

## Do not do

Do not:
- ask Codex to continue M0 inside the current docs-only folder;
- manually create an empty `.git` here and call it the source repo;
- copy reference SQL into production source;
- let Claude start writing product code before OpenSEO baseline.

## Recommended recovery

1. Replace the old extracted orchestration pack with **V1.2.1 Complete**.
2. In the V1.2.1 pack folder run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-openseo-windows.ps1
```

The script will create a sibling directory:

```text
SearchGrowth-OpenSEO
```

and will:
- clone `every-app/open-seo`;
- checkout frozen commit `3632f408528cd588fec98c3a174af8ea0ad205e8`;
- create `integration/ai-v1`;
- overlay the complete Search Growth V1.0 specification/control pack;
- verify `package.json`, `pnpm-lock.yaml`, and `src/`.

3. Open **that new `SearchGrowth-OpenSEO` folder** in Codex and VS Code.
4. Give Codex the one message in `40_ONE_MESSAGE_TO_CODEX.md`.
5. Codex runs the environment probe and starts M0/M0.5.

## Expected repository shape

```text
SearchGrowth-OpenSEO/
├── .git/
├── package.json
├── pnpm-lock.yaml
├── src/
├── ...
├── AGENTS.md
├── CLAUDE.md
├── 00_START_HERE.md
├── docs/adr/
├── schemas/
├── skills/
├── templates/
├── fixtures/
├── reference-implementations/
├── checklists/
├── .ai-orchestrator/
└── control/
```

Only this shape is ready for dual-agent development.
