# Test & Acceptance Plan — V1.0

> 目标：证明这是一个能真实闭环的 Search Growth MVP，而不是一套“页面能点”的 Demo。

## 1. Release Gate

V1.0 上线前必须通过：

1. Data Integrity：SEO/GEO 数据真实、不重复、不串 Surface。
2. Decision Integrity：Opportunity 只有一套主决策，缺数据不当 0。
3. Content Integrity：内容、证据、素材和批准版本一致。
4. Execution Integrity：Dry Run、一次审批、幂等、Kill Switch、对账、公开验证。
5. Feedback Integrity：SEO/GEO/GA4/Index 回流且不夸大因果。

## 2. OpenSEO Baseline Regression

任何业务代码前执行：

```bash
pnpm install --frozen-lockfile
pnpm run db:migrate:local
pnpm format:check
pnpm types:check
pnpm lint
pnpm test
pnpm build
```

若存在 `pnpm test:e2e` / `pnpm ci:check` 一并执行。
输出 `IMPLEMENTATION_BASELINE.md`。Baseline 未通过不得进入 M1。

## 3. GEO Fresh Sampling Blocker

同 prompt/provider/model/surface，repeats=3：

- 建立 3 个独立 `geo_observation_runs`；
- provider mock `observe()` 调 3 次；
- request id 独立；
- `application_cache_bypassed=true`；
- 不读 Prompt Explorer 7日应用缓存；
- 不破坏 Prompt Explorer 原缓存行为。
  失败不得合并 PR。

## 4. Observation Surface Isolation

以下不能混成一个无解释 GEO 分数：

- `AGGREGATED_SEARCH_DATA`
- `MODEL_API_SEARCH`
- `CONSUMER_PRODUCT_OBSERVED`
- `MANUAL_CONSUMER_OBSERVATION`
  测试 numerator/denominator、UI filter、model/version/search mode/locale provenance 均独立。

## 5. GEO Parser Gold Set

准备 30–50 条人工标注回答，覆盖中英、品牌/产品/竞品、推荐/不推荐、Citation、位置、错误事实。
最低：

- entity mention agreement ≥95%
- recommendation agreement ≥90%
  不达标时 Recommendation Rate 不得成为首页主指标。

## 6. Raw/Parse Immutability

Raw Run 创建后：

- Parser v1；
- Parser v2 reparse。
  断言 Raw 永不 UPDATE；v1/v2 共存；snapshot记录 parser version。

## 7. Opportunity Profiles

至少测试：

- EXISTING_GOOGLE_PAGE
- EXISTING_SEARCH_PAGE_PARTIAL
- NEW_TOPIC
- GEO_DISTRIBUTION
- EVIDENCE_ONLY
  要求 profile确定、missing != 0、score deterministic、LLM不改score、technical blocker可优先。

## 8. PageFit/Cannibalization

Fixtures：

- 同 intent page → REFRESH_PAGE
- 两页重叠 → MERGE
- 无页 → NEW_PAGE
- 内容够但 Citation Gap 大 → DISTRIBUTE_ONLY
- 缺证据 → EVIDENCE_ONLY
- noindex/canonical 错 → TECHNICAL_FIX
  输出候选URL、证据、confidence。

## 9. OwnedSite Update Safety

读取 revision/hash → before snapshot → diff → approve。
审批后人工修改 CMS，再执行旧 revision：
必须 conflict，不覆盖；创建新版本重新审核。

## 10. Content / Claims

- UNVERIFIED hard claim → BLOCKED
- EXPIRED claim → BLOCKED/重新验证
- ContentVersion 保存 claim ids/source refs/evidence refs
- Gate 无权被 Agent override

## 11. Media

验证：

- jpg/png/webp/mp4；
- executable/MIME mismatch/oversize/hash mismatch 拒绝；
- signed URL 会过期但不进入永久网页；
- `rights_status=UNKNOWN` 阻止无人值守公开发布；
- CMS 产生永久 `PublishedMediaRef`；
- Local Bridge 下载后重算 SHA256。

## 12. Release Immutability

Content v1 → Release R1 → Dry Run → Approve hash H1。
任何正文/variant/asset/target/UTM 改变都必须创建 R2。
Execute hash 必须等于 approved H1。

## 13. State Transition / Concurrency

禁止：

- DRAFT → COMPLETED
- DRAFT_CREATED → PUBLIC_VERIFIED
- ACCEPTED_REMOTE_TASK → blind re-publish
  关键状态使用 Compare-And-Set。并发 approve/execute/claim 只能一个成功。

## 14. Kill Switch / Blast Radius

测试：

- global pause
- platform pause
- max targets/release
- max releases/day
- max posts/platform/day
- min interval
  Pause 后 server 不启动新 side effect，Bridge 不领新 job，必须写 audit。

## 15. Wechatsync Draft Stager

每个认证平台测试：
auth → stage draft → draft id/url → content fingerprint → draft verify → image handling。
P0 首批：知乎、掘金、CSDN。
**DRAFT_CREATED/DRAFT_VERIFIED 不算 Public 成功。**

## 16. Same-Draft Finalizer

每个平台：

1. Wechatsync 建草稿；
2. 使用同一 draft id；
3. 不创建第二篇；
4. final publish；
5. public URL；
6. title/key paragraph verify；
7. Receipt 关联 Draft。
   必须证明 `draft_id → public_content_id/url`。

## 17. yxer Contract

完整测试：

```text
doctor
→ accounts list
→ prepare
→ schema fields
→ validate
→ publish --dry-run
→ publish
→ taskSetId
→ query details/records
→ terminal state
→ public URL verify
```

硬断言：

- taskSetId 只代表 `ACCEPTED_REMOTE_TASK`
- 未查 terminal 不得成功
- platform fail → EXECUTION_FAILED
- taskSetId 已存在禁止 blind re-publish
- timeout/unknown → reconcile
- wrapper 不调用 `yxer update`

## 18. social-auto-upload

至少认证抖音/小红书之一：
正常授权账号、local session、fixed uploader、public result、URL/状态验证、Cookie不上云。

## 19. Postiz

GLOBAL 至少认证一个目标。独立服务、pinned version、publish、receipt、public URL verify。

## 20. Route Isolation

Route A `WECHATSYNC_STAGED_FINALIZE` 使用 Wechatsync draft。
Route B `YXER_NATIVE` 使用 yxer task。
禁止把 Wechatsync draftId 当 yxer taskSetId；Route A失败不能无条件切Route B创建重复内容。

## 21. REMOTE_STATE_UNKNOWN

模拟平台已接受但客户端 timeout：
状态必须 `REMOTE_STATE_UNKNOWN`，先 task/draft/public list/fingerprint reconcile；确认未发布后才可受控重试。

## 22. Public Verification

`targetIntent=PUBLIC` 只有 `PUBLIC_VERIFIED` 成功。
组合验证：

- provider status
- external content id
- public URL
- Safe URL
- public accessibility（适用）
- URL pattern
- title/key paragraph fingerprint
- expected account
- publish time window
  `taskSetId`、`button clicked`、`submitted` 不算。

## 23. Security

SSRF：拒绝 localhost/private/link-local/metadata/file/javascript/public→private redirect。
XSS：script/event/javascript link 清理。
Prompt injection：抓取网页里的指令不能触发 tool/action。

## 24. Search/Index

Google：GSC URL inspection/robots/canonical/sitemap；禁止普通页使用 Google Indexing API。
Baidu：无合法 submit 能力时显式 NOT_CONFIGURED。
Bing：SERP；IndexNow 可选。

## 25. Citation → Publication

PublicationReceipt URL 与后续 GEO Citation（带tracking/fragment/trailing slash变体）通过 URLIdentity 匹配，标记 `CONTROLLED_PUBLICATION`。

## 26. GA4 / UTM

- source=platform
- medium=organic_distribution
- campaign=`sg_<release_short_id>`
- content=`<target_short_id>`
  验证 URL encoding、canonical无tracking、复用 OpenSEO GA4 campaign breakdown。

## 27. Experiment

GEO：T0/D7/D14/D30 fresh point-in-time。
GA4/GSC：

- D7 post7 vs pre7
- D14 post14 vs pre14
- D30 post30 vs pre30
  保存 window/timezone/data lag/model/surface/parser/data-quality。

## 28. Full Closed-loop E2E

真实 staging/低风险内容：
Project → Market/Topic/Entity → SEO/GEO baseline → Opportunity → PageFit → Content/Claim/Source → Media → Gate → Release Dry Run → One Approval → Website → 3 Wechatsync Drafts → 3 Same-Draft Public → ≥1 extra China Public → GLOBAL时≥1 Postiz → Receipts → Public Verify → Crawl/Index → Citation match → GA4 UTM → Experiment → Next Action。

## 29. MVP Acceptance

中国范围最低：

- 官网 1
- 知乎/掘金/CSDN 3
- 头条/百家/小红书/抖音至少 1
  合计 ≥5 个 `PUBLIC_VERIFIED`（官网计入）。

GLOBAL 项目再要求 ≥1 海外 Public Target。

至少一个已发布资产进入 Search/Index、GEO Recheck、GA4/UTM、Experiment Snapshot，才可称 **Search Growth Closed-loop MVP**。
