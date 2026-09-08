# USER ACTION REQUIRED

REQUEST TYPE: HUMAN GATE — DATA CONTRACT DECISION
CURRENT TASK: T107-M1-GEO-ENTITY-MENTION-SCHEMA, Round 1

## Decision needed

Approve the minimal forward schema expansion that makes GeoEntityMention database-enforce same-Project ownership with its concrete GeoObservationParse and TrackedEntity.

## Why this is required

The direct `GeoObservationParse` list has no Project identity. T107 therefore can add individual Parse and Entity FKs, but cannot prove that both parents belong to the same Project. The current Round 1 design would permit a Parse under Project A to reference an Entity under Project B.

## Proposed next action after approval

Define a bounded T107 Round 2 that adds the minimum explicit Project key(s) and composite FKs through new forward migrations, retains append-only raw/parse records, and adds dual-dialect cross-Project rejection tests. No provider, credential, publishing, paid, or production action is involved.
