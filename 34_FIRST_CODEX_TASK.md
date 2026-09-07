# First Codex Task

Give Codex the whole V1.0 pack plus this instruction:

> Execute **M0 and M0.5 only**. Do not implement product UI yet.
>
> 1. Confirm OpenSEO HEAD equals the frozen baseline or report the exact difference.
> 2. Run all baseline install/migrate/type/lint/test/build commands.
> 3. Produce `IMPLEMENTATION_BASELINE.md` from the template.
> 4. Inspect the real OpenSEO code paths listed in `04_OPENSEO_REUSE_CODE_MAP.md`.
> 5. On an authorized Windows/operator test node, run the Wechatsync/yxer connector scripts and produce `CONNECTOR_BASELINE.md`.
> 6. Prove at least one real same-draft publishing path: `Wechatsync draft → same draft public → verified URL`.
> 7. Do not invent platform capabilities if credentials or accounts are missing; mark them `BLOCKED_BY_EXTERNAL_DEPENDENCY`.
> 8. Stop after M0/M0.5 and return code-map/connector findings before changing the domain schema.

Reason:
V1.0 intentionally eliminates the two highest-risk sources of rework first:

- hidden mismatch with the OpenSEO source;
- hidden mismatch with real publishing platforms.
