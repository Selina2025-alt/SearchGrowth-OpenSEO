# PROJECT STATE

PROJECT: Search Growth SEO/GEO MVP V1.0
CONTROL LAYER: Dual-Agent Orchestration V1.1
OVERALL STATUS: IN_PROGRESS
CURRENT MILESTONE: M2 GEO (M0.5 external feasibility remains gated)
CURRENT TASK: T161-M2-GEO-ENTITY-MENTION-BATCH-CONTEXT-SERVICE
INTEGRATION BRANCH: integration/ai-v1
LATEST ACCEPTED COMMIT: 1dd170d7329d6a012a7fa4085b203a4bf1271603
LAST REVIEW: T160-M2-GEO-CITATION-BATCH-READER ROUND 1 PASS — three-selector version-explicit persisted citation evidence read verified
CURRENT ROUND: 1 / 3
LAST COMPLETED ACTION: T160 Round 1 accepted and merged to integration/ai-v1.
CURRENT BLOCKER: M0.5 external accounts/publishing Human Gates H1/H2 remain closed.
NEXT EXACT ACTION: WAITING_FOR_EXECUTOR — await T161 DELIVERY.md, then perform Fast Review in the T161 task worktree.

## COMPLETED

- Mission and resumable controller state established.
- Direct Claude CLI environment confirmed ready without dangerous permission bypass.
- T000-M0 Freeze & Baseline accepted with reproducible source, command, architecture, E2E, CI, and security evidence.
- T000-M0-E2E-RECOVERY accepted in round 2 of 3 and merged to `integration/ai-v1`.
- T100-M1-MARKET-PROFILE-SCHEMA accepted in round 3 of 3 and merged to `integration/ai-v1`.
- T101-M1-SEARCH-TOPIC-SCHEMA accepted in round 2 of 3 and merged to `integration/ai-v1`.
- T102-M1-TOPIC-KEYWORD-REFS-SCHEMA accepted in round 2 of 3 and merged to `integration/ai-v1`.
- T103-M1-ENTITY-ALIAS-SCHEMA accepted through its authorized recovery and merged to `integration/ai-v1`.
- T104-M1-SEARCH-PROMPT-SCHEMA accepted in round 2 of 3 and merged to `integration/ai-v1`.
- T105-M1-GEO-OBSERVATION-RUNS-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T106-M1-GEO-OBSERVATION-PARSE-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T107-M1-GEO-ENTITY-MENTION-SCHEMA accepted in round 3 of 3 and merged to `integration/ai-v1`.
- T108-M1-GEO-CITATION-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T109-M1-OPPORTUNITY-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T110-M1-SOURCE-REF-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T111-M1-CLAIM-SOURCE-RELATION-SCHEMA accepted in round 3 of 3 and merged to `integration/ai-v1`.
- T112-M1-CLAIM-ALLOWED-MARKET-RELATION-SCHEMA accepted in round 2 of 3 and merged to `integration/ai-v1`.
- T113-M1-CLAIM-ALLOWED-LANGUAGE-RELATION-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T114-M1-MEDIA-ASSET-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T115-M1-PUBLISHED-MEDIA-REF-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T116-M1-BASELINE-LINT-HYGIENE accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T117-M1-CONTENT-PACKAGE-CONTAINER-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T118-M1-CONTENT-VERSION-CORE-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T119-M1-CONTENT-VERSION-CLAIM-REF-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T120-M1-CONTENT-VERSION-SOURCE-REF-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T121-M1-CONTENT-VERSION-MEDIA-ASSET-REF-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T122-M1-CONTENT-VARIANT-CORE-SCHEMA accepted in round 2 of 3 and merged to `integration/ai-v1`.
- T123-M1-CONTENT-VARIANT-MEDIA-ASSET-REF-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T124-M1-RELEASE-BUNDLE-CORE-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T125-M1-RELEASE-TARGET-CORE-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T126-M1-AUDIT-EVENT-CORE-SCHEMA accepted in its preserved round 1 continuation and merged to `integration/ai-v1`.
- T127-M1-RUNTIME-CONTROL-CORE-SCHEMA accepted in round 2 of 3 and merged to `integration/ai-v1`.
- T128-M1-INDEXING-OBSERVATION-CORE-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T129-M1-EXPERIMENT-CORE-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T130-M1-EXPERIMENT-SNAPSHOT-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T131-M1-SEARCH-GROWTH-TARGET-CORE-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T132-M1-TARGET-PREFERRED-MARKET-RELATION-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T133-M1-PUBLICATION-EXECUTION-PLAN-CORE-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T134-M1-PLATFORM-DRAFT-CORE-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T135-M1-PUBLISHING-JOB-CORE-SCHEMA accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T136-M1-PUBLICATION-RECEIPT-CORE-SCHEMA accepted in round 2 of 3 and merged to `integration/ai-v1`.
- T137-M1-INDEXING-OBSERVATION-PUBLICATION-RECEIPT-RELATION accepted in round 1 of 3 and merged to `integration/ai-v1`.
- T138-M2-GEO-FRESH-SAMPLING-CORE accepted in round 3 of 3 and merged to `integration/ai-v1`.

## IN PROGRESS

- T139-M2-GEO-OBSERVATION-RUN-RECORDER-REPOSITORY accepted in round 3 of 3 and merged to `integration/ai-v1`; append-only run persistence preserves faithful raw evidence.
- T140-M2-GEO-OBSERVATION-PARSE-RECORDER-REPOSITORY accepted in round 1 of 3 and merged to `integration/ai-v1`; parser versions persist independently without touching raw observations.
- T141-M2-GEO-ENTITY-MENTION-RECORDER-REPOSITORY accepted in round 1 of 3 and merged to `integration/ai-v1`; mention facts bind concrete parses and same-Project tracked entities without changing raw evidence.
- T142-M2-GEO-CITATION-RECORDER-REPOSITORY accepted in round 1 of 3 and merged to `integration/ai-v1`; citation facts bind concrete parses and optional receipts without changing evidence or performing attribution.
- T143-M2-GEO-PARSE-OUTPUT-BUNDLE-CONSISTENCY accepted in round 1 of 3 and merged to `integration/ai-v1`; concrete parse Project/identity consistency is established before future recorder composition.
- T144-M2-GEO-EXACT-ENTITY-MENTION-MATCHER-CORE accepted in round 1 of 3 and merged to `integration/ai-v1`; exact literal evidence spans are deterministic without entity storage lookup or persistence.
- T145-M2-GEO-EXACT-ENTITY-MENTION-CANDIDATE-READER accepted in round 1 of 3 and merged to `integration/ai-v1`; active exact case-sensitive candidate eligibility is Project-scoped and read-only.
- T146-M2-GEO-EXACT-ENTITY-MENTION-DETECTION-SERVICE accepted in round 1 of 3 and merged to `integration/ai-v1`; it transparently composes candidate read and exact matching with error propagation.
- T147-M2-GEO-EXACT-ENTITY-MENTION-FACT-ASSEMBLER accepted in round 1 of 3 and merged to `integration/ai-v1`; exact spans are atomically bound to concrete parse facts while retaining traceability.
- T148-M2-GEO-EXACT-ENTITY-MENTION-ASSEMBLY-SERVICE accepted in round 1 of 3 and merged to integration/ai-v1; it composes accepted detection and assembly for one parse without persistence.
- T149-M2-GEO-CITATION-FACT-ASSEMBLER accepted in round 1 of 3 and merged to integration/ai-v1; citation evidence is parse-bound without URL identity, matching, or persistence.
- T150-M2-GEO-CONFIDENCE-CLASSIFIER-CORE accepted in round 1 of 3 and merged to integration/ai-v1; the frozen confidence thresholds are a pure classifier.
- T151-M2-GEO-MEASUREMENT-COHORT-IDENTITY-GUARD accepted in round 2 of 3 and merged to integration/ai-v1; it rejects unsupported surfaces and cross-context measurement cohorts.
- T152-M2-GEO-MEASUREMENT-COHORT-CONTEXT-STAMP accepted in round 1 of 3 and merged to integration/ai-v1; it preserves a structured five-field cohort context without creating a metric or identity key.
- T153-M2-GEO-REPEAT-FRACTION-PRESENTER accepted in round 1 of 3 and merged to integration/ai-v1; it presents exact default/high-value repeat fractions without a percentage or metric.
- T154-M2-GEO-OBSERVATION-BATCH-READER accepted in round 1 of 3 and merged to integration/ai-v1; it reads immutable Project-scoped run batches in deterministic order without cohort or metric meaning.
- T155-M2-GEO-OBSERVATION-COHORT-MEMBER-PROJECTOR accepted in round 2 of 3 and merged to integration/ai-v1; it projects rows to a T151-validated cohort while preserving order and raw-evidence isolation.
- T156-M2-GEO-OBSERVATION-COHORT-CONTEXT-ASSEMBLER accepted in round 1 of 3 and merged to integration/ai-v1; it composes T155 and T152 into an immutable ordered cohort context.`r`n- T157-M2-GEO-OBSERVATION-BATCH-COHORT-CONTEXT-SERVICE accepted in round 1 of 3 and merged to integration/ai-v1; it composes one Project/batch T154 read with T156 without metrics or evidence mutation.`r`n- T158-M2-GEO-BATCH-REPEAT-FRACTION-CONTEXT-SERVICE accepted in round 1 of 3 and merged to integration/ai-v1; it composes T157 with T153 to present stored-success samples against the supplied 3/5 request.`r`n- T159-M2-GEO-ENTITY-MENTION-BATCH-READER accepted in round 1 of 3 and merged to integration/ai-v1; it reads version-explicit Project/batch/entity mentions without matching or metric semantics.`r`n- T160-M2-GEO-CITATION-BATCH-READER accepted in round 1 of 3 and merged to integration/ai-v1; it reads version-explicit Project/batch citation evidence without URL or publication interpretation.

## BLOCKED

- M0.5 external connector/account publishing remains gated by H1/H2. Internal M1 domain work may proceed without weakening M0.5 acceptance.

## NEXT

Automation watcher is paused by Product Owner direction. Manual Controller flow is active; T157 is accepted and T158 is the next credential-free M2 task. Never merge to `main`.
