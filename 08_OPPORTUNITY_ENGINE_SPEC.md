# Search Growth Opportunity Engine V1.0

## 1. 原则

最终 score 由服务器 deterministic service 计算。LLM 只解释，不改分数。

## 2. Technical Blockers 优先于普通分数

例如：

- site-wide block；
- key page noindex；
- canonical conflict；
- failed publication；
- conversion CTA broken。

这类以 `BLOCKER_PRIORITY` 排在普通 Growth Opportunity 前。

## 3. Score Profiles

### A. EXISTING_GOOGLE_PAGE

有 GSC/GA4 且可使用 OpenSEO SearchOpportunity：

```text
Business Fit             20
Buying Intent            15
OpenSEO Existing SEO     30
GEO Gap                  20
Execution Ease           15
                         100
```

### B. EXISTING_SEARCH_PAGE_PARTIAL

没有完整 GA4/GSC：

```text
Business Fit             25
Buying Intent            20
Search Demand            20
Rank/Visibility Gap      15
GEO Gap                  10
Execution Ease           10
                         100
```

### C. NEW_TOPIC

没有 existing page：

```text
Business Fit             30
Buying Intent            25
Search Demand            20
GEO Gap                  15
Execution Ease           10
                         100
```

### D. GEO_DISTRIBUTION

内容已有，但引用/分发不足：

```text
Business Fit             25
Buying Intent            20
Mention Gap              20
Citation Source Gap      25
Execution Ease           10
                         100
```

### E. EVIDENCE_ONLY

不强行用统一 score；优先级由：

- claim importance；
- evidence missing severity；
- affected topics/pages；
  确定。

## 4. Missing Data

`missing != 0`。

不允许：

- 没有 GA4 就把 GA4 score 设 0；
- 没有 GEO 就认为 GEO gap=100。

选择匹配 profile 并显示 warnings。

## 5. DataQuality

```text
status: COMPLETE | DEGRADED | INSUFFICIENT
warnings: [
  LOW_SAMPLE,
  NO_GA4,
  NO_GSC,
  MODEL_CHANGED,
  SURFACE_CHANGED,
  PROVIDER_PARTIAL_FAILURE,
  NEW_SITE
]
```

## 6. PageFit Service

输入：

- Topic；
- intent；
- existing pages；
- GSC/rank；
- page content summary；
- canonical。

输出：

- action；
- candidate page；
- reason；
- risk of cannibalization；
- target URL/slug suggestion。

## 7. 推荐动作

Opportunity 最终必须输出具体 Action，例如：

- Refresh `/solutions/rfq`；
- 新建 security FAQ；
- 对现有页面补 3 个 approved claims；
- 发布至知乎/CSDN/头条形成 citation surface；
- 修复 noindex；
  而不是“提升内容质量”。
