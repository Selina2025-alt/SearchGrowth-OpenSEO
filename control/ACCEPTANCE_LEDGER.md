# ACCEPTANCE LEDGER

| Scope | Status | Accepted date | Evidence | Integration commit |
| --- | --- | --- | --- | --- |
| `T000-M0-E2E-RECOVERY` | PASS (round 2/3) | 2026-09-07 | `control/tasks/T000-M0-E2E-RECOVERY/REVIEW.md`; 1,171 unit tests, 11/11 E2E at 6x CPU stress, build and `ci:check` PASS; empty DataForSEO key and fixture-only paths | `e2c7b9bcc0659e3ae641431ac5a6c9b34d873d9b` |
| `T000-M0` final review | PASS | 2026-09-07 | `control/tasks/T000-M0/REVIEW.md`; `IMPLEMENTATION_BASELINE.md`; frozen-source ancestry, migration, reuse map, formatting/ADR semantic proof, full regression matrix | `e2c7b9bcc0659e3ae641431ac5a6c9b34d873d9b` |
| M0 Freeze & Baseline | PASS | 2026-09-07 | T000 final review plus accepted recovery evidence | `e2c7b9bcc0659e3ae641431ac5a6c9b34d873d9b` |

## Active work

- `T100-M1-MARKET-PROFILE-SCHEMA`: in progress under the three-round Claude-first loop.
- M0.5 real connector/account feasibility: pending Human Gates H1/H2; it does not authorize connector implementation or external publishing.
