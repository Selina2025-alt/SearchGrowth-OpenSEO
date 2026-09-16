# REVIEW — T145-M2-GEO-EXACT-ENTITY-MENTION-CANDIDATE-READER

ROUND: 1 of 3
VERDICT: PASS

## VERIFIED

- The port reuses T144's exact-match candidate contract. The repository performs
  two read-only, Project-scoped selects: active entity canonical names, then
  aliases joined to their active same-Project entity. It does not invoke the
  matcher, record mentions, inspect raw evidence, or mutate source data.
- Alias eligibility is strict: only `EXACT` aliases whose persisted
  `caseSensitive` value is true enter the literal matcher candidate set.
  CASE_INSENSITIVE_EXACT, WORD_BOUNDARY, UNICODE_SUBSTRING, DOMAIN,
  case-insensitive exact aliases, inactive entities, and other Projects are
  excluded.
- Canonicals precede aliases; each group orders by stable ids. No priority is
  selected or used. Same-surface canonical and alias collisions are returned as
  independent candidates, so no arbitrary winner, dedupe, or alias
  classification is introduced. An empty Project has a clear empty-list result.
- Invalid Project input rejects before reads. An eligible row with an unusable
  id or surface throws a typed, row-addressable failure instead of producing a
  partial candidate list. Database errors are not caught or transformed into an
  empty result.
- Controller verification: 8 relevant entity schema, matcher, candidate-reader,
  recorder, and parity suites / 480 tests passed; Prettier, TypeScript, and
  oxlint passed. DELIVERY records final full test (213 files / 2,158 tests),
  build, and `ci:check` exit 0.
- Diff is limited to the reader port, adapter, focused real-storage and boundary
  tests, and task evidence. No migration, provider/cache, external operation,
  credential, publishing, or production behavior is present.

## FINDINGS

None. Candidate scope is intentionally Project/entity/alias only; market and
observation context belongs to a later parse-composition caller, which must use
the existing T143 concrete-parse consistency guard.

## MERGE DECISION

PASS. Commit the accepted task artifacts and merge only into `integration/ai-v1`.
