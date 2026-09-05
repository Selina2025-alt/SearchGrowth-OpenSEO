# Attribution & Experiment Spec V1.0

## 1. Attribution 边界

MVP 闭环到：

```text
Visibility
→ Public Content
→ Visit
→ GA4 Key Event
```

不声称已经做到 CRM revenue attribution。

## 2. UTM Policy

每个外部 target：

```text
utm_source=<platform>
utm_medium=organic_distribution
utm_campaign=sg_<release_short_id>
utm_content=<target_short_id>
```

官网 canonical URL 不带 UTM。

保留已有 UTM 的策略必须明确，不重复拼参数。

## 3. GA4

优先复用 OpenSEO 既有 GA4 traffic acquisition/report 能力。

Monitor 按 `campaign=sg_<release>` 获取：
- sessions；
- engaged sessions；
- key events；
- session key event rate（如果现有数据支持）。

不创建第二套 GA4 Client。

## 4. Experiment Activation

### SEO Website Experiment
`activation_at = website PUBLIC_VERIFIED time`

### Distribution Experiment
由配置：
- FIRST_REQUIRED_PUBLIC；或
- ALL_REQUIRED_TERMINAL。

默认 `FIRST_REQUIRED_PUBLIC`，同时记录各 target 实际 published_at。

## 5. Required target

ReleaseTarget 有 `required=true/false`。

可选 LinkedIn 失败不能让核心 SEO Experiment 永久卡住。

## 6. Windows

### GEO
point-in-time samples：T0/D7/D14/D30。

### Rank/Index
point-in-time observation。

### GSC/GA4
- D7：post 7d vs pre 7d；
- D14：post 14d vs pre 14d；
- D30：post 30d vs pre 30d。

Snapshot 保存：
- window_start/end；
- timezone；
- source data lag；
- data quality。

## 7. Model/Surface Drift

如果 recheck：
- model changed；
- search mode changed；
- surface changed；
则显示 warning，不直接将变化归因于内容。

## 8. Citation Attribution

如果 AI citation normalized URL 命中 PublicationReceipt：
- 标 `CONTROLLED_PUBLICATION`；
- 显示 release/target/date；
- 这属于关联证据，不等同于严格因果证明。

## 9. Next Action

CompareService 输出：
- observed change；
- confidence/warnings；
- next action；
- whether to continue/refresh/distribute/stop。
