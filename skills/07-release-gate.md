# Skill: Evidence / Quality / Release Gate

version: 1.0
checks:

- claim status
- source traceability
- intent fit
- page fit/cannibalization
- duplication/low-value
- CTA
- URL safety
- XSS safety
- media availability/rights
- classification
  outputs: GateReport
  rules:
- BLOCKED不能由Agent override。
- PUBLIC unattended release不得含rights_status=UNKNOWN素材。
