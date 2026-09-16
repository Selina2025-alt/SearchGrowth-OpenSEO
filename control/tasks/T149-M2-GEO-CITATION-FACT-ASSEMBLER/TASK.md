# TASK — T149-M2-GEO-CITATION-FACT-ASSEMBLER

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one small, pure fact-assembly boundary that binds caller-supplied,
already-extracted citation evidence to one concrete versioned GEO parse. It
returns unpersisted, traceable citation drafts for the accepted T142 recorder;
citation extraction and URL identity remain later work.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §7;
`07_GEO_MEASUREMENT_SPEC.md` §§5–6 and §8; Accepted
`docs/adr/ADR-005-versioned-geo-parse.md`; accepted T140 parse contract;
T142 citation recorder; T143 bundle guard; and relevant service/test patterns.
Do not reread the complete baseline, unrelated ADRs, or M0.5 materials.

## IN SCOPE

1. Add one storage-free service contract and implementation that receives one
   concrete `GeoObservationParseFact`, the Project id under which the caller
   extracted citation evidence, an ordered caller-supplied citation-id list,
   and an ordered list of caller-supplied citation evidence candidates. Return
   one draft per candidate, in supplied order. Each draft must contain the
   recordable T142 `GeoCitationFact` and retain the identical input candidate
   object as its provenance. The fact's `projectId` and `parseId` must come
   exclusively from the concrete parse; its id must come exclusively from the
   aligned caller id.
2. Validate before returning any draft: input/container shape; non-empty
   Project/parse/id strings; strict equality of caller Project and parse Project;
   one-to-one id/candidate cardinality; unique caller ids; a concrete
   non-`FAILED` parse; and the recordable citation leaf contract required by
   T142 (non-empty raw URL, normalized URL, and domain; title and position
   explicit as string-or-null and non-negative integer-or-null; valid accepted
   `CitationSourceOwnership`; matched receipt id explicit as non-empty
   string-or-null). Invalid input must reject with a typed, indexed/call-level
   error and must not return partial drafts.
3. Preserve evidence exactly. Do not parse, normalize, trim, lowercase,
   serialize, clone, rewrite, dedupe, sort, rank, infer, or validate semantic
   URL/domain equivalence. Do not classify source ownership or match a receipt.
   The candidate object and its primitive values are opaque caller evidence;
   returned provenance must retain that candidate by identity. Do not mutate
   caller arrays, parse, or candidates.
4. Add focused tests for: successful ordered construction and identity;
   zero citations; explicit null optionals; same-project success; cross-project
   rejection; duplicate/malformed id; cardinality mismatch; malformed candidate
   fields; invalid ownership; negative/fractional position; failed parse;
   candidate/input non-mutation; no partial output; and a source-boundary test
   proving no database/repository/recorder/provider/network/raw-observation
   access or URL/ownership/receipt logic. Tests must demonstrate that opaque
   URL evidence is never normalized or changed.
5. No schema/migration/snapshot/dependency changes; no parser runtime or LLM;
   no URL identity/matching, receipt lookup, ownership inference, persistence,
   bundle orchestration, cache/provider/UI/CRUD/server function, credentials,
   publishing, paid action, or production behavior.
6. Run focused tests plus `format:check`, `types:check`, `lint`, full `test`,
   `build`, and `ci:check`, recording exact exits. A worktree bootstrap may use
   `corepack pnpm install --frozen-lockfile` only if dependencies are absent;
   record it and do not change lockfiles. If an aggregate gate is sandbox-denied,
   record it once and stop without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only: `corepack pnpm install --frozen-lockfile`, `corepack pnpm exec vitest
run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack
pnpm format:check`, `corepack pnpm types:check`, `corepack pnpm lint`,
`corepack pnpm test`, `corepack pnpm build`, `corepack pnpm ci:check`, and
read-only `git status`, `git diff`, `git log`, `git show`, `git rev-parse`,
`git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch
`main`, access production, invoke a provider, access credentials/accounts,
access Prompt Explorer/R2/application-cache, or invoke publishing/paid behavior.

## ACCEPTANCE CRITERIA

- [ ] Every returned fact is atomically bound to the exact caller-supplied parse
  and its Project, while preserving supplied citation evidence and provenance
  by identity and order.
- [ ] Cross-Project, failed-parse, malformed, duplicate-id, cardinality, and
  invalid leaf input reject explicitly before any draft escapes.
- [ ] No URL normalization/identity, ownership classification, receipt matching,
  parser/persistence/provider/cache behavior, or business uniqueness rule is
  added.
- [ ] Focused tests cover all listed success, identity, preservation, and
  negative invariants. No schema, migration, snapshot, dependency, or unrelated
  runtime change occurs.
- [ ] DELIVERY contains exact gate exits, focused/full-test summaries, changed
  paths, evidence-preservation proof, scope/security declaration, and final git
  status.

## DELIVERY

Write `control/tasks/T149-M2-GEO-CITATION-FACT-ASSEMBLER/DELIVERY.md` with the
required evidence, then stop.
