# System Architecture V1.0

## 1. 总体

```text
┌─────────────────────────────────────────────────────────────┐
│                     OpenSEO Host App                         │
│                                                             │
│  Existing SEO/GSC/GA4/Project Context/Auth/Workflow/MCP      │
│                           │                                 │
│          ┌────────────────┴────────────────┐                │
│          │ Search Growth Domain            │                │
│          │ Topic / Entity / Prompt         │                │
│          │ GEO / Opportunity / Content     │                │
│          │ Release / Experiment            │                │
│          └────────────────┬────────────────┘                │
│                           │                                 │
│                 Distribution Controller                    │
└───────────────────────────┼─────────────────────────────────┘
                            │
       ┌────────────────────┼──────────────────────────┐
       │                    │                          │
       ▼                    ▼                          ▼
  Server Executors     Local Publisher Bridge      External Services
  - OwnedSite          - Wechatsync CLI            - Postiz
  - Postiz client      - Publisher Companion       - optional paid media
  - verification       - yxer CLI
                       - social-auto-upload
```

## 2. 为什么只有一个 Search Growth Agent

Agent 只做：

- 意图/场景判断；
- 选择 Skill；
- 解释 Opportunity；
- 生成 Brief/Content；
- 推荐 Next Action。

不让 Agent 直接：

- 修改数据库状态；
- 绕过 Release approval；
- 自由操作浏览器；
- 自己构造未注册 platform API；
- 判定“发布成功”。

成功判定由 Workflow + Verifier 完成。

## 3. Server vs Local

### Server

适合：

- SEO/GEO measurement；
- data processing；
- DB；
- content generation；
- CMS API；
- Postiz；
- index/GA4；
- release orchestration。

### Local Publisher Bridge

适合：

- 已登录浏览器；
- Wechatsync；
- same-draft finalizer；
- yxer local/client mode；
- social-auto-upload；
- auth recovery。

主服务不保存浏览器 cookie。

## 4. Server-side durable execution

沿用 OpenSEO Cloudflare Workflows 风格：

- GeoMeasurementWorkflow
- ReleaseOrchestrationWorkflow（只负责产生/推进任务，不长时间等待本机）
- ExperimentRecheckWorkflow
- ReconciliationWorkflow / scheduled watchdog

本机 Job 使用 DB lease。

## 5. Distribution Routes

### OWNED_SITE

```text
ContentVersion → Website Render → CMS Create/Update → Verify → Receipt
```

### WECHATSYNC_STAGED_FINALIZE

```text
ContentVariant
→ Wechatsync CLI
→ PlatformDraft
→ Draft Verify
→ Certified same-draft Finalizer
→ Public Verify
→ Receipt
```

### YXER_NATIVE

```text
ContentVariant
→ prepare/schema/upload
→ validate
→ dry-run
→ publish
→ taskSet accepted
→ query details/records
→ public verify
→ Receipt
```

### SOCIAL_AUTO_UPLOAD_NATIVE

用于抖音/小红书/视频号/视频平台等。

### POSTIZ_NATIVE

用于海外/API 社交平台。

### PAID_MEDIA_SERVICE

媒体服务商/新闻媒体投放；独立 spend approval。

## 6. Browser Companion 约束

Same-draft Finalizer 推荐一个很小的 Companion Extension/Local Runtime：

- 只支持 allowlisted domains；
- finalizer ID 是本地静态注册代码；
- server 不可下发任意 JavaScript；
- 不读取/上传 Cookie；
- 只用当前浏览器正常登录态；
- CAPTCHA/2FA 立即暂停；
- 发布后只读验证。

## 7. 不用的东西

P0 无需：

- Graph DB；
- Vector DB；
- separate agent framework；
- generic RPA platform；
- message bus；
- workflow SaaS。
