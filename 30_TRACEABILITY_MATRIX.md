# Requirement → Component → Test

| Requirement        | Component               | Test              |
| ------------------ | ----------------------- | ----------------- |
| OpenSEO不重复      | Reuse Layer             | baseline/code-map |
| Market真实         | SearchMarketProfile     | market fixture    |
| Topic稳定          | SearchTopic             | mapping           |
| 品牌/产品/竞品     | Entity/Alias            | parser            |
| 真重复采样         | SamplingService         | cache regression  |
| Raw不可变          | GeoObservationRun       | reparse           |
| Parser升级         | GeoObservationParse     | v1/v2             |
| Surface不混        | Metrics                 | isolation         |
| 小样本可信         | Confidence              | UI/metric         |
| 一套Opportunity    | SearchGrowthOpportunity | profiles          |
| 防蚕食             | PageFit                 | fixtures          |
| 安全更新旧页       | OwnedSite               | concurrency       |
| Claim可追溯        | Claim/Source            | gate              |
| Canonical内容      | ContentVersion          | hash/render       |
| CTA                | Conversion Gate         | CTA               |
| 素材安全           | MediaAsset              | MIME/hash/rights  |
| 永久媒体           | PublishedMediaRef       | E2E               |
| 批准锁死           | ReleaseBundle           | immutable         |
| 一次审批自动执行   | Distribution            | E2E               |
| 草稿非成功         | Wechatsync              | draft→public      |
| 同草稿发布         | Finalizers              | same-draft        |
| yxer正确语义       | YxerReconciler          | accepted fixture  |
| 社媒发布           | Social executor         | one platform      |
| 海外发布           | Postiz                  | one target        |
| timeout不重复      | Reconcile               | remote unknown    |
| Public URL才成功   | Verifier                | public verify     |
| 可暂停             | RuntimeControls         | kill switch       |
| 可审计             | AuditEvent              | assertions        |
| Cookie不上云       | Bridge                  | security          |
| SSRF/XSS/Injection | Safety                  | suites            |
| Citation认出分发   | URLIdentity             | receipt match     |
| 发布带来访问       | UTM/GA4                 | campaign          |
| 效果回流           | Experiment              | snapshots         |

每个 P0 FR 必须能映射到组件与测试。
