# Skill: Distribution Planning
version: 1.0
purpose: 为approved ContentVersion生成确定的PublicationExecutionPlan。
inputs: ReleaseTargets, certifications, constraints, account connections
outputs: route, stager/finalizer/executor, required fields, verification policy
rules:
- 只能选CERTIFIED executor。
- Wechatsync draft和yxer task identity不能互换。
- fallback前必须reconcile。
- targetIntent=PUBLIC最终要求PUBLIC_VERIFIED。
