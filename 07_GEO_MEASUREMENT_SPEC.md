# GEO Measurement Spec V1.0

## 1. 不把 GEO 视为单一排名

必须区分 Observation Surface：

- `AGGREGATED_SEARCH_DATA`
- `MODEL_API_SEARCH`
- `CONSUMER_PRODUCT_OBSERVED`
- `MANUAL_CONSUMER_OBSERVATION`

不同 surface 不混 numerator/denominator。

## 2. Fresh Sampling

Measurement run 必须绕过 OpenSEO Prompt Explorer 的应用层缓存。

同 prompt/model 3 repeats：
- provider adapter 实际调用 3 次；
- 3 个独立 run；
- 记录 provider request id；
- `application_cache_bypassed=true`。

## 3. Repeats

默认：3。  
高价值 Prompt：5。

单 Prompt UI：优先显示 `2/3`，不要只显示 `66.7%` 制造虚假精度。

## 4. Confidence

Topic aggregate：

- LOW：<10 successful observations；
- MEDIUM：≥10 且 ≥3 distinct prompts；
- HIGH：≥30 且 ≥5 distinct prompts，且无重大 surface/model change warning。

不宣称统计显著性。

## 5. Parsing

Raw run 不更新。

Parser v1/v2/v3 通过 `geo_observation_parses` 版本化。

Deterministic 优先：
- exact/domain/alias mentions；
- citation URL parse；
- known entities。

LLM parser 只用于：
- recommendation语义；
- nuanced sentiment/accuracy。

## 6. Parser Gold Set

MVP 准备至少 30–50 条中英文 AI 回答人工标注：
- entity mention；
- recommendation；
- position；
- citations。

Parser Agreement 目标 ≥90%，否则 Recommendation Rate 不进入主仪表盘。

## 7. Metrics

- Entity Mention Rate
- Recommendation Rate
- Owned Domain Citation Rate
- Controlled Publication Citation Rate
- Citation Share
- Competitor Share
- Accuracy

全部必须带：
- surface filter；
- market profile；
- model/version；
- sample count；
- confidence；
- data quality warnings。

## 8. Citation ↔ Publication

Citation URL normalized 后：
1. match own domains；
2. match `publication_receipts.published_url`；
3. 若命中外部平台我们自己的发布记录 → `CONTROLLED_PUBLICATION`。

这是分发对 GEO 贡献的重要反馈。

## 9. Consumer AI

没有稳定/授权自动接口的平台：
- 可以 Manual/Semi-auto Observation；
- P1 可做本地固定浏览器采样；
- 不绕平台限制、不做 stealth。
