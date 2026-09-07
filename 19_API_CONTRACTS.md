# API & Adapter Contracts V1.0

## 1. Internal API

- project scoped；
- OpenSEO auth；
- Zod validation；
- server computed scores；
- immutable approved objects；
- correlation ID；
- no secrets in response。

## 2. External Local Bridge API

必须 contract-grade OpenAPI，至少：

- pair；
- heartbeat；
- list jobs；
- claim；
- asset download；
- progress；
- receipt；
- auth required notification。

## 3. Protocol Version

Bridge：

```text
protocol_version
client_version
min_server_version
adapter_versions
```

不兼容时拒绝执行副作用。

## 4. Adapter Types

### AiObservationAdapter

```ts
observe(FreshObservationInput): RawObservation
```

### SearchIndexAdapter

```ts
inspect(url)
submit?(url)
```

### OwnedSiteAdapter

```ts
inspectPage(url);
createPage(spec);
updatePage(url, spec, expectedRevision);
uploadMedia(asset);
verifyPage(url);
```

### DraftStagerAdapter

见 Wechatsync spec。

### SameDraftFinalizer

见 Finalizer spec。

### NativePublisherExecutor

用于 yxer/social/Postiz：

```ts
capabilities();
validate();
dryRun();
submit();
reconcile();
verifyPublic();
```

## 5. PublicationExecutionPlan

Execution Plan 是 server 生成的 immutable snapshot，至少：

- route；
- adapter/finalizer id/version；
- account；
- constraints；
- expected content/media hash；
- verification profile；
- required；
- UTM；
- schedule；
- fallback policy。

## 6. Errors

统一：

- code；
- safeMessage；
- retryClass；
- correlationId。

内部 provider raw error 只进 redacted logs。

## 7. Retry Class

- SAFE_RETRY
- RECONCILE_FIRST
- HUMAN_AUTH_REQUIRED
- NON_RETRYABLE

`publish timeout` 默认 `RECONCILE_FIRST`。
