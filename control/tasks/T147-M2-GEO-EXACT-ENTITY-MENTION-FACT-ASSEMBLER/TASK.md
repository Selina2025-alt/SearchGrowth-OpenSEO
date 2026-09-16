# TASK — T147-M2-GEO-EXACT-ENTITY-MENTION-FACT-ASSEMBLER

STATUS: AUTHORIZED
MILESTONE: M2 GEO
OWNER: Claude Code + DeepSeek Implementation Engineer
CONTROLLER: Codex
MAX ROUNDS: 3

## GOAL

Add one small, storage-free assembler that binds accepted T146 exact-detection
spans to one concrete accepted T140 GEO parse and emits traceable T141
`GeoEntityMentionFact` drafts. It must preserve the original match basis beside
each fact and leave persistence to the existing recorder.

## READ ONLY

Read `CLAUDE.md`; `05_DOMAIN_DATA_MODEL.md` §4 and §7;
`07_GEO_MEASUREMENT_SPEC.md` §§5–6; Accepted `docs/adr/ADR-005-versioned-geo-parse.md`;
accepted T140 parse contract; T141 mention recorder; T143 consistency guard;
T144 matcher; T146 detection service; and relevant pure-domain test patterns.
Do not reread the full baseline or unrelated ADRs.

## IN SCOPE

1. Add one narrow, storage-free input/output contract and pure assembler. It
   receives one concrete `GeoObservationParseFact`, the Project id used for its
   preceding exact detection, a same-length ordered list of caller-supplied
   mention ids, and T144 match spans. It returns one draft per match containing
   both the generated `GeoEntityMentionFact` and the original
   `GeoExactEntityMentionMatch` by identity.
2. Validate cross-fact context before producing any output: supplied detection
   Project id must strictly equal the parse fact Project id; parse id and every
   supplied mention id must be nonempty strings; id count must exactly equal
   match count; each mention id must be unique within this assembled batch; and
   a FAILED parse must reject. SUCCESS and PARTIAL parse facts are valid: a
   partial parser result may carry evidence, while a failed parse has none to
   attach. Errors must identify the field/index and no partial draft may return.
3. Map every match without transforming it: fact `projectId`/`parseId` come from
   the concrete parse, `entityId` and `evidenceText` come verbatim from the
   match, `mentioned` is `true`, and `recommended`, `mentionPosition`, and
   `sentiment` are explicit `null`. Preserve the original match alongside the
   fact so its canonical-vs-alias source basis and start/end offsets remain
   auditable. Do not infer recommendation, ranking/position, sentiment, entity
   ownership, or alias priority.
4. Keep the helper pure: do not mutate, clone, serialize, normalize, dedupe,
   reorder, inspect raw evidence/text, call the reader/matcher/recorder/database,
   select a current parse, or write storage. Multiple identical or colliding
   matches remain separate in their original order; only duplicate caller-supplied
   primary-key ids reject before later storage would fail.
5. Add focused tests covering SUCCESS/PARTIAL assembly, FAILED rejection,
   cross-Project rejection, id/cardinality/duplicate-id failures, order and
   collision preservation, exact alias/canonical source traceability, nullable
   fact mapping, opaque-evidence identity/no mutation/no serialization, and
   source boundary with no repository/recorder/provider access.
6. No schema/migration/snapshot/dependency, matching/reader invocation, parser
   execution, bundle orchestration, mention persistence, provider/cache, UI,
   CRUD/server function, credentials, publishing, paid action, or production
   behavior.
7. Run focused tests plus `format:check`, `types:check`, `lint`, full `test`,
   `build`, and `ci:check`, recording exact exits. A worktree bootstrap may use
   `corepack pnpm install --frozen-lockfile` only if dependencies are absent;
   record it and do not change lockfiles. If an aggregate gate is sandbox-denied,
   record it once and stop without bypass. Write DELIVERY and stop.

## APPROVED COMMANDS

Use only: `corepack pnpm install --frozen-lockfile`, `corepack pnpm exec vitest
run <files>`, `corepack pnpm exec prettier --write <task-files>`, `corepack pnpm
format:check`, `corepack pnpm types:check`, `corepack pnpm lint`, `corepack pnpm
test`, `corepack pnpm build`, `corepack pnpm ci:check`, and read-only `git
status`, `git diff`, `git log`, `git show`, `git rev-parse`, `git ls-files`.

Do not use `--dangerously-skip-permissions`, commit, merge, push, touch `main`,
access production, invoke a provider, access credentials/accounts, access
Prompt Explorer/R2/application-cache, or invoke publishing/paid behavior.

## ACCEPTANCE CRITERIA

- [ ] A pure assembler binds exact detection matches to one concrete parse and
  returns T141 mention-fact drafts plus the original match basis by identity.
- [ ] Project/parse/id/cardinality/duplicate-id/FAILED parse failures are
  explicit and atomic; SUCCESS and PARTIAL inputs map only the permitted fields
  with explicit null semantic fields.
- [ ] Input/output order and collision evidence are preserved without data
  transformation, persistence, reader/matcher calls, raw-evidence access, or a
  new ranking/uniqueness business rule.
- [ ] Focused tests cover all listed invariants. No schema, migration, snapshot,
  dependency, provider/cache, or unrelated runtime change occurs.
- [ ] DELIVERY contains mapping/error/evidence-preservation evidence, exact
  gate exits, focused/full-test summaries, changed paths, scope/security
  declaration, and final git status.

## DELIVERY

Write `control/tasks/T147-M2-GEO-EXACT-ENTITY-MENTION-FACT-ASSEMBLER/DELIVERY.md`
with the required evidence, then stop.
