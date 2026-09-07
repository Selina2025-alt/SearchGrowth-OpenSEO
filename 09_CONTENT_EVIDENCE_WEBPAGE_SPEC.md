# Content, Evidence & WebPage Spec V1.0

## 1. Canonical Source

Canonical content：

- Markdown；
- structured metadata；
- `asset://<id>`；
- claim/source refs。

HTML/平台正文都是 renderer 输出，不是 source of truth。

## 2. ContentPackage

至少包含：

- topic/market/persona；
- target keywords；
- target prompts；
- search intent；
- page fit action；
- brief；
- claims；
- sources；
- CTA；
- assets。

## 3. Claim Gate

Hard claims：

- 必须 `APPROVED`；
- 未验证不得自动发布。

Soft analysis：

- 可明确标注分析/推测；
- 不伪装为事实。

## 4. Data Classification

- `PUBLIC_MARKETING`：可发送配置允许的外部 AI；
- `INTERNAL`：仅允许 project provider policy 中的 provider；
- `RESTRICTED`：不得发外部 AI。

## 5. WebPageSpec

```text
slug
metaTitle
metaDescription
h1
canonicalPolicy
robots
hreflang[]
schemaJsonLd[]
internalLinkTargets[]
cta
conversionGoal
```

不创建“AI 专用 Schema”魔法字段。

## 6. Conversion Readiness Gate

官网公开前：

- CTA_PRESENT
- CTA_TARGET_VALID
- CONVERSION_GOAL_MATCHED
- CONTACT/FORM route reachable

## 7. Platform Variants

平台原生适配：

- title；
- summary；
- format；
- tags/categories；
- external link policy；
- cover/image constraints；
- CTA expression。

不要把一篇完全相同的长文机械复制 10 个平台。

## 8. Immutable Versions

ContentVersion 一旦用于 approved Release：

- 不可编辑；
- 修改产生 v2；
- Release bundle hash 必须变化。

## 9. Rights Gate

Media `rights_status=UNKNOWN` 不允许 unattended public release。

## 10. Source traceability

每篇内容能追溯：

- Claims used；
- URLs/docs；
- generated timestamp；
- parser/model/provider where relevant。
