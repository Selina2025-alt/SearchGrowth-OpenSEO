# ACCEPTANCE LEDGER

| Scope                               | Status           | Accepted date | Evidence                                                                                                                                                                                                | Integration commit                         |
| ----------------------------------- | ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `T000-M0-E2E-RECOVERY`              | PASS (round 2/3) | 2026-09-07    | `control/tasks/T000-M0-E2E-RECOVERY/REVIEW.md`; 1,171 unit tests, 11/11 E2E at 6x CPU stress, build and `ci:check` PASS; empty DataForSEO key and fixture-only paths                                    | `e2c7b9bcc0659e3ae641431ac5a6c9b34d873d9b` |
| `T000-M0` final review              | PASS             | 2026-09-07    | `control/tasks/T000-M0/REVIEW.md`; `IMPLEMENTATION_BASELINE.md`; frozen-source ancestry, migration, reuse map, formatting/ADR semantic proof, full regression matrix                                    | `e2c7b9bcc0659e3ae641431ac5a6c9b34d873d9b` |
| M0 Freeze & Baseline                | PASS             | 2026-09-07    | T000 final review plus accepted recovery evidence                                                                                                                                                       | `e2c7b9bcc0659e3ae641431ac5a6c9b34d873d9b` |
| `T100-M1-MARKET-PROFILE-SCHEMA`     | PASS (round 3/3) | 2026-09-07    | `control/tasks/T100-M1-MARKET-PROFILE-SCHEMA/REVIEW.md`; dual-dialect schema/migrations, explicit non-null market identity, 192 focused and 1,184 full tests, clean `db:generate`, build and `ci:check` | `7256dd013e860eb3e530aa11059c5c63bf4ecd94` |
| `T101-M1-SEARCH-TOPIC-SCHEMA`       | PASS (round 2/3) | 2026-09-07    | `control/tasks/T101-M1-SEARCH-TOPIC-SCHEMA/REVIEW.md`; same-Project merge integrity, stable identity, dual-dialect 0046/0024 migrations, 207 focused and 1,199 full tests, build and `ci:check`         | `16ce86f379b6258b8613760a5b11a5211b4932a3` |
| `T102-M1-TOPIC-KEYWORD-REFS-SCHEMA` | PASS (round 2/3) | 2026-09-07    | `control/tasks/T102-M1-TOPIC-KEYWORD-REFS-SCHEMA/REVIEW.md`; existing OpenSEO keyword reuse, same-Project composite FKs, 0047/0025 migrations, 212 focused and 1,212 full tests, build and `ci:check`   | `034f757bf993a8266797185813adfe20615bab47` |

## Active work

- T103 is the next approved credential-free M1 slice: TrackedEntity and EntityAlias domain foundations.
- M0.5 real connector/account feasibility: pending Human Gates H1/H2; it does not authorize connector implementation or external publishing.
