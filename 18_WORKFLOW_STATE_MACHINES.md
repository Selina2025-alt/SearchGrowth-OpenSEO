# Workflow & State Machines V1.0

## 1. Release

```text
DRAFT
→ DRY_RUN_READY
→ READY_FOR_APPROVAL
→ APPROVED
→ EXECUTING
→ COMPLETED | PARTIAL
```

Side states：PAUSED/CANCELLED。

非法：DRAFT → COMPLETED。

## 2. PUBLIC ReleaseTarget

```text
PLANNED
→ PREFLIGHT
→ EXECUTION_READY
→ [route specific]
→ PUBLISH_SUBMITTED
→ PUBLIC_VERIFYING
→ PUBLIC_VERIFIED
```

### Wechatsync route
```text
EXECUTION_READY
→ STAGING_DRAFT
→ DRAFT_CREATED
→ DRAFT_VERIFIED
→ FINALIZE_READY
→ FINALIZING
→ PUBLISH_SUBMITTED
```

### yxer route
```text
EXECUTION_READY
→ VALIDATING
→ DRY_RUN_PASSED
→ SUBMITTING
→ ACCEPTED_REMOTE_TASK
→ RECONCILING
→ PUBLISH_SUBMITTED
```

异常：
- AUTH_REQUIRED
- PUBLISH_FIELDS_REQUIRED
- RATE_LIMITED
- REMOTE_STATE_UNKNOWN
- REJECTED
- EXECUTION_FAILED
- VERIFY_FAILED

## 3. DRAFT Target

若 target intent 本来就是 DRAFT：
`DRAFT_VERIFIED` 可以是 terminal success，**但不能计入 public release KPI**。

## 4. Compare-And-Set

所有关键迁移：

```sql
UPDATE ...
SET status = :next
WHERE id=:id AND status=:expected;
```

affected rows != 1 → conflict。

## 5. Local Job Lease

```text
QUEUED
→ LEASED
→ RUNNING
→ terminal / retryable
```

字段：
- leased_by；
- lease_expires_at；
- attempts；
- idempotency_key。

## 6. Unknown Remote State

如果请求已发送但 response 不确定：
- status `REMOTE_STATE_UNKNOWN`；
- 进入 reconcile；
- 不回到 SUBMITTING 重新发。

## 7. Workflow Responsibilities

### GeoMeasurementWorkflow
bounded batches；单 sample failure 不丢全 batch。

### ReleaseOrchestrationWorkflow
- assert approved/pause；
- create jobs；
- 不长期等待 Local Bridge；
- job receipts/reconciler推进 Release completion。

### ExperimentRecheckWorkflow
fresh measurement + GSC/GA4 windows + index snapshot。

### Watchdog
- stale lease；
- stuck RUNNING；
- orphan accepted task；
- release reconciliation。
