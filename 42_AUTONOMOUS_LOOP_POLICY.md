# Autonomous Loop Policy

Codex may automatically:
- create task packets;
- create task branches/worktrees;
- invoke Claude CLI;
- run local tests/builds;
- write reviews;
- dispatch up to two fix rounds after the initial run;
- merge PASS task branches into integration/ai-v1;
- continue existing V1.0 backlog tasks.

Stop on Human Gate, Scope/ADR conflict, missing credential, production/paid/destructive action, security exception, three failed rounds, untrustworthy tests, or connector/spec conflict.

No infinite loops:
1 initial run + 2 fix runs + 3 reviews maximum.

Task PASS may merge to integration. `main` remains untouched until human final acceptance.
