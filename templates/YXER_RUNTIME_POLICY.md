# yxer Runtime Policy

1. yxer is an external official CLI/service.
2. Production version is pinned after smoke.
3. Search Growth runtime never executes `yxer update`.
4. API key/session is local/operator-managed; never written to Search Growth logs.
5. `publish` returning taskSetId = ACCEPTED, not PUBLIC.
6. Always query task details/records to terminal.
7. Public target also requires PublicVerification.
8. Existing taskSetId prohibits blind re-publish.
9. Timeout without remote certainty = REMOTE_STATE_UNKNOWN.
10. No yxer source is copied into the host repository unless a future explicit license permits it and legal review approves.
