# OpenSEO Reuse Code Map

**Frozen base**: `every-app/open-seo` @ `3632f408528cd588fec98c3a174af8ea0ad205e8`  
**原则**：M0 必须在真实源码核验后才开始业务代码。

## 1. 直接复用

| 能力 | 复用 | V1.0 行为 |
|---|---|---|
| Project | existing | 不新建第二套项目 |
| Project Context | existing | 叙事定位/写作偏好继续用 |
| Competitors | existing | 只加 Entity mapping |
| Key Pages | existing | PageFit 输入 |
| Keyword research | existing | Topic mapping，不复制关键词库 |
| Rank Tracking | existing | MarketProfile 映射 |
| Site Audit | existing | Technical blocker 输入 |
| GSC | existing | SEO/Index/PageFit |
| GA4 | existing | traffic/key-event/UTM |
| AI Brand Lookup | existing | `AGGREGATED_SEARCH_DATA` surface |
| Prompt Explorer | existing | 人工探索，不作为 fresh repeat measurement |
| SearchOpportunityService | existing | EXISTING_GOOGLE_PAGE 的 seo signal |
| Cloudflare Workflow pattern | existing | 长任务 |
| Auth | existing | 新模块沿用 |
| D1/PG pattern | existing | 新表双实现 |
| MCP | existing | 可暴露 read/actions，但写操作仍走 Gate |

## 2. 必须避免的错误复用

### Prompt Explorer Cache
若同 prompt/model 7 天命中同一 cache：
- 可以用于交互探索；
- **不可以**循环 3 次当作 3 个 GEO 样本。

新建 `MeasurementSamplingService` fresh path。

### SearchOpportunityService
现有逻辑偏“已有页面近线优化”，不要把它当全局 Topic Opportunity。

作为 `seoExistingPageSignal` 输入。

## 3. M0 源码必须逐项确认

- `src/db/project-context.schema.ts`
- AI Search server functions/services
- Brand Lookup cache
- Prompt Explorer cache
- GA4 SearchOpportunityService
- GSC services
- RankCheckWorkflow
- scheduled handler
- R2 bindings
- D1/Postgres migrations/schema pattern
- project route conventions
- auth/middleware
- GA4 traffic acquisition capability

## 4. V1.0 新增主要模块建议目录

最终路径以 M0 code map 为准，概念上：

```text
src/server/features/search-growth/
  domain/
  topics/
  entities/
  geo/
  opportunities/
  content/
  distribution/
  experiments/
  security/
```

不得为了匹配本文档而破坏 OpenSEO 既有目录规范。
