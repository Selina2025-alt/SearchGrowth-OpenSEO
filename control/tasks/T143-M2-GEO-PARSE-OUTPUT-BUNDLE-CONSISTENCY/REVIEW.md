# REVIEW — T143-M2-GEO-PARSE-OUTPUT-BUNDLE-CONSISTENCY

ROUND: 1 of 3
VERDICT: PASS

## VERIFIED

- The bundle contract has one accepted concrete parse fact and reuses the
  accepted T141/T142 child-fact types. For every mention and citation, the pure
  guard requires strict equality of both `projectId` and `parseId` with the
  parse fact. A concrete parse is already bound to exactly one immutable run,
  so this prevents cross-parse, cross-run, and cross-sample child mixing without
  introducing a second observation identity.
- Rejection is explicit and auditable: `GeoParseOutputBundleIdentityError`
  carries and names the offending collection and index. The focused tests cover
  Project and parse mismatches for both child kinds, including a later array
  index.
- The guard returns the original bundle, arrays, and facts by identity. It has
  no database/recorder imports or calls and performs no cloning, serialization,
  normalization, deduplication, raw-evidence inspection, mutation, parser
  selection, or persistence. The opaque-evidence regression test preserves the
  supplied string byte-for-byte.
- Controller verification: the T143 guard plus the accepted T139–T142 recorder
  suites passed (5 files / 154 tests); Prettier, TypeScript, and oxlint passed.
  DELIVERY records final full test (209 files / 2,097 tests), build, and
  `ci:check` exit 0.
- Diff is limited to the pure bundle contract, its focused tests, and task
  evidence. No schema, migration, dependency, provider/cache, parser/extractor,
  workflow, credential, publishing, or production change is present.

## FINDINGS

None. The approved task intentionally enforces cross-fact identity only:
leaf-value validation, parse-status policy, duplicate semantics, and recorder
persistence remain with the accepted recorder contracts. This prevents the
consistency layer from silently redefining those boundaries.

## MERGE DECISION

PASS. Commit the accepted task artifacts and merge only into `integration/ai-v1`.
