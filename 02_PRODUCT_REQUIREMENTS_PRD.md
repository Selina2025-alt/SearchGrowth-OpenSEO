# PRD — AI-native SEO × GEO Search Growth MVP V1.0

## 1. 产品定义

> **Search Growth Agent**：在传统搜索和 AI 搜索中持续发现 B2B 获客机会，基于可信证据生产内容，自动公开分发，并通过 SEO/GEO/GA4 数据验证观察到的变化。

## 2. 用户问题

B2B 市场团队真正需要回答：

- 目标客户在搜索引擎搜什么？
- 在 ChatGPT/豆包/元宝/DeepSeek 等 AI 场景会怎么问？
- 我们是否出现、被推荐、被引用？
- 竞品在哪里领先？
- 应该新建页、刷新旧页、补技术问题、补证据，还是扩大分发？
- 内容是否已经真正公开，而不是停在草稿？
- 发布后是否被抓取/索引/引用/访问？
- 哪些动作值得继续？

## 3. MVP 用户角色

### Operator

- 管 Search Growth Target；
- 跑 Baseline；
- 管 Prompt/Topic/Entity；
- 看 Opportunity；
- 生成/编辑 Content；
- 审批 Release；
- 处理 AUTH_REQUIRED 等阻塞；
- 看 Experiment。

### Admin

- DataForSEO/GSC/GA4/AI Provider；
- CMS/Postiz/Local Bridge；
- Publisher Certification；
- Runtime Pause；
- 配额/预算；
- 系统健康。

MVP 不做复杂 RBAC。

## 4. 主要对象

- Project（OpenSEO existing）
- SearchGrowthTarget
- SearchMarketProfile
- SearchTopic
- TrackedEntity / EntityAlias
- SearchPrompt
- GeoObservationRun / GeoObservationParse / Citation
- SearchGrowthOpportunity
- Claim / SourceRef
- ContentPackage / ContentVersion / ContentVariant / WebPageSpec
- MediaAsset / PublishedMediaRef
- ReleaseBundle / ReleaseTarget
- PublicationExecutionPlan
- PlatformDraft
- PublishingJob / PublicationReceipt
- IndexObservation
- AuditEvent / RuntimeControl
- Experiment / ExperimentSnapshot

## 5. Flow A — Setup & Baseline

1. 选择 OpenSEO Project；
2. 填 Product/ICP/Persona/Conversion Goal；
3. 建 SearchMarketProfile；
4. 读取 OpenSEO SEO/GSC/GA4/Pages/Competitors；
5. 建 SearchTopic；
6. Keyword ↔ Topic；
7. 生成 Prompt Library；
8. 跑 fresh GEO baseline；
9. 计算 Top Opportunities。

## 6. Flow B — Opportunity → Content

1. Opportunity detail；
2. PageFit：
   - NEW_PAGE
   - REFRESH_PAGE
   - MERGE
   - DISTRIBUTE_ONLY
   - EVIDENCE_ONLY
   - TECHNICAL_FIX
3. Content Brief；
4. Claims/Evidence；
5. Canonical Markdown；
6. WebPageSpec；
7. Platform-native variants；
8. Media Assets；
9. Quality/Evidence/Conversion/Security Gate。

## 7. Flow C — One Approval → Public Distribution

1. 创建 ReleaseBundle；
2. 生成每个 Target 的 PublicationExecutionPlan；
3. Dry Run；
4. Human 一次批准 immutable ReleaseBundle；
5. 自动执行：
   - 官网 create/update；
   - Wechatsync stage → same-draft Finalizer；
   - 或 yxer native；
   - 或 social-auto-upload；
   - 或 Postiz；
6. 每个 PUBLIC target 必须到 `PUBLIC_VERIFIED`。

付费媒体服务另有 Spend Approval。

## 8. Flow D — Observe & Learn

1. 保存 PublicationReceipt；
2. URLIdentity 归一化；
3. Website crawl/index monitor；
4. GA4 UTM campaign tracking；
5. fresh GEO recheck；
6. Citation ↔ Publication matching；
7. D7/D14/D30 Snapshot；
8. Observed Change；
9. Next Action。

## 9. 关键页面

### Overview

- Today’s Growth Opportunities
- Critical technical blockers
- AI Visibility summary
- SEO trend
- Publishing health
- Recent experiments

### Discover

- Topics
- Keywords
- Prompts
- Competitors
- Market profiles

### Visibility

- SEO
- AI surface filters
- Entity mentions
- Citation sources
- Controlled publication citations

### Opportunities

- rank
- score profile
- data quality
- page fit
- recommended action

### Content

- brief
- claim/evidence
- canonical Markdown
- web spec
- variants
- gate

### Distribution

- execution plan
- draft staging
- finalizer
- task state
- receipts
- public URLs

### Monitor

- index
- GA4
- GEO recheck
- experiments
- next action

## 10. 非功能要求

- Side effect 必须 idempotent；
- 所有长任务有 durable workflow/job；
- External status 不能靠 UI 乐观推断；
- 所有关键状态迁移 CAS；
- 关键写操作 audit；
- Provider credentials 不回传前端；
- 浏览器 session local-only；
- DB D1/Postgres parity；
- Production third-party versions pinned；
- 失败可恢复，不能靠“重跑整个流程”。

## 11. 成功指标

产品指标：

- Time to first baseline
- Opportunity → release conversion
- Public verified rate
- Distribution failure rate
- GEO mention/citation coverage
- Organic sessions/key events
- Experiment completion rate

业务结果指标只观察，不承诺：

- pipeline/revenue 后续接 CRM 再补。
