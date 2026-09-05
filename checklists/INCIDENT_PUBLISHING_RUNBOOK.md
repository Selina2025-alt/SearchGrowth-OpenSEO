# Publishing Incident Quick Runbook

1. Set `GLOBAL_PUBLISHING_PAUSED=true`.
2. Do not delete remote publications automatically.
3. Identify affected release/targets/jobs from audit + receipts.
4. For unknown remote states, reconcile before any retry.
5. Revoke compromised bridge/token if relevant.
6. Suspend affected platform certification.
7. Determine whether content correction/removal is required and execute with account owner.
8. Preserve logs without secrets.
9. Fix and smoke in staging.
10. Recertify platform before resume.
