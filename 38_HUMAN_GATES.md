# Human Gates

## H0 Local AI Environment
Required once if direct Claude CLI orchestration is not confirmed.
Need: local Codex shell access, `claude` CLI in same execution environment, `claude -p` reaches intended backend, shared repo filesystem.

## H1 Credentials / Account Login
DataForSEO, GSC/GA4, Postiz, yxer, normal platform/browser login. Never place secrets in task files.

## H2 External Test Publish
Before first real external publishing smoke, human sets `allow_external_test_publish=true` and allowed test platforms/accounts.

## H3 Product / Architecture Change
Required for scope changes, Accepted ADR replacement, new major infrastructure/dependency, automation→manual downgrade, or security-risk workaround.

## H4 Paid Spend
Required before paid media or unapproved external API/service spend.

## H5 Destructive / Production Data
Required for destructive production migrations or irreversible external deletion.

## H6 Production Publishing
Always human-controlled in V1.0.

## H7 Final MVP Acceptance
Human reviews FINAL_ACCEPTANCE_PACKET and decides integration→main.

Default = not approved. See `control/APPROVALS.json`.
