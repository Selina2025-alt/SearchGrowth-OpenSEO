# Git Worktree Protocol

Branches:

- main: human final
- integration/ai-v1: controller integration
- ai-task/<TASK_ID>: executor task

Worktree:
`.ai-worktrees/<TASK_ID>`

Lifecycle:

1. ensure integration branch;
2. task branch from integration HEAD;
3. create worktree;
4. Claude runs only there;
5. Codex reviews via `git -C`;
6. PASS → controller merges task branch into integration;
7. remove worktree;
8. do not merge integration→main.

One executor task at a time by default.
