# Deployment Runbook — V1.0

## 1. 运行拓扑

### Cloud / Server

OpenSEO Host：

- UI/API
- Search Growth Domain
- GSC/GA4/DataForSEO
- GEO Workflows
- Opportunity
- Content/Release
- Distribution Controller
- Verification/Experiment

### Storage

- existing DB/R2
- 新 `MEDIA_BUCKET`：private source media

### Independent Services

- Postiz
- P1 可选 Paid Media Service

### Operator Windows Node

- Chrome 正常企业账号登录
- Wechatsync Extension/CLI/MCP
- Search Growth Local Bridge
- Publisher Companion（固定 Finalizer）
- yxer CLI（启用时）
- social-auto-upload worker（启用时）

## 2. Frozen OpenSEO

```bash
git clone <company-fork>
git remote add upstream https://github.com/every-app/open-seo.git
git fetch upstream
git checkout -b feature/search-growth-v1 3632f408528cd588fec98c3a174af8ea0ad205e8
```

如升级 upstream，必须重跑 Code Map + M0，不得静默跟 main。

## 3. Server Secrets

部署 Secret：

- DataForSEO
- Google OAuth
- Better Auth
- AI provider
- Postiz
- CMS
- Bridge pairing

禁止浏览器 Cookie/yxer session 进 Cloud DB/log。

## 4. R2

新增 `MEDIA_BUCKET` 时同时核验：

- `wrangler.jsonc`
- `alchemy.run.ts` 或当前等效定义
- local/dev/prod bindings
  Bucket private、短期授权、MIME/size、SHA256、project scope。

## 5. Local Publisher Node

Windows 10/11 + Chrome + Node/npm + Python/uv（需要social worker时）。
安装 Wechatsync、Local Bridge、Publisher Companion、yxer、social-auto-upload。
账号所有者正常完成登录。

## 6. yxer

使用开发包：

- `scripts/install-yxer-windows.ps1`
- `scripts/smoke-yxer-windows.ps1`
  Staging discovery → exact candidate → smoke → certification → production pin。
  Runtime 禁止执行 `yxer update`。

## 7. Wechatsync

研究 pin：`a98e42865387285afcc027c61836488748f3b30f`。
实际实施仍需 connector smoke，记录 CLI/Extension 真实版本与结果 contract。
GPL runtime 外部使用，不 vendor 主仓。

## 8. Postiz

独立服务，pin release/container，staging account，API smoke。
不直接生产跟 `latest`。

## 9. social-auto-upload

独立 Python env，pin commit/tag，session local，每个平台独立 certification。

## 10. Safe Defaults

生产首次部署：

```text
PUBLISHING_ENABLED=false
GLOBAL_PUBLISHING_PAUSED=true
```

通过 staging E2E + certifications 再解锁。
配置 blast limits。

## 11. Bridge Pairing

one-time code → scoped token；server只存 token hash。
绑定 org/project/bridge/executors/protocol version，可 revoke，heartbeat。

## 12. Bridge 权限

允许：job poll/claim、资产下载、status/receipt、heartbeat/capabilities。
禁止：读全项目、改Claim、生成内容、读AI secrets、执行任意 shell/JS。

## 13. Publisher Companion

仅注册 allowlisted finalizer：

- zhihu-v1
- juejin-v1
- csdn-v1
  Server只发送 executor id/draft id/target id/expected hash/结构化字段。

## 14. Staging

必须有 staging Project/CMS/GA4/GSC 和低风险外部发布内容。
无专用测试账号时，用明确批准的低风险文章做 smoke 并记录。

## 15. Health

Server：DB/DataForSEO/GSC/GA4/AI/R2/Postiz/Workflow/scheduler。
Bridge：last_seen/protocol/Chrome/Wechatsync/yxer/social worker/finalizer registry。

## 16. Logs

结构化 correlationId/project/release/target/job/executor/platform/status/latency。
Redact Cookie/Auth/API key/session/敏感个人字段。

## 17. Runtime Controls

DB `runtime_controls` 是真实 kill switch；env `PUBLISHING_ENABLED` 是部署上限。二者均允许才执行。

## 18. Recovery

- Bridge offline → WAITING_WORKER
- auth过期 → AUTH_REQUIRED，恢复后 resume
- remote unknown → reconcile，不blind retry
- UI/API change → suspend该 certification
- wrong release → Global Pause，不自动删外部内容
- workflow crash → watchdog/reconciler

## 19. Upgrade

candidate → staging smoke → capability diff → certification → production rollout → audit。
禁止自动更新生产 connector。

## 20. V1.0边界

假定 internal/single organization。
外部多租户 SaaS 前另做 vault/RBAC/tenant quota/privacy/security/legal。
