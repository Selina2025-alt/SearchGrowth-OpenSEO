# V1.0 Final Decisions

本文件是 V0.1、V0.2、V0.3 自查与 V0.4 分发调研后的最终决策集。AI Coding 不得在未创建替代 ADR 的情况下自行推翻。

## A. 不变的核心

1. OpenSEO 是 Host，不再起第二套 SEO 应用。
2. 先识别目标客户和搜索需求，再生产内容。
3. Evidence/Claims 前置。
4. Agent 负责判断，Skill 负责能力，Tool 负责执行，Workflow 负责可靠性。
5. Human approval 是系统角色，不是临时补丁。
6. 发布、采样、实验全部可审计。
7. MVP 只跑闭环，不追求全平台和全 Skill。

## B. V1.0 新增的结构性修正

### 1. SearchTopic
解决“AI询报价 / RFQ Automation / 智能询报价”被当成多个主题的问题。

### 2. TrackedEntity + EntityAlias
GEO 不只看品牌，还看产品、竞品、竞品产品。

### 3. Raw Observation 与 Parse 分离
`geo_observation_runs` 永远不可变；Parser 升级写新 `geo_observation_parses`。

### 4. Opportunity Score Profiles
缺 GA4、全新 Topic、非 Google 市场、GEO 分发等场景的公式固定，不允许 AI Coding 临时猜。

### 5. SearchMarketProfile
统一 engine/location/language/device，避免 `CN/GLOBAL` 粗粒度污染数据。

### 6. OwnedSiteAdapter 支持 create/update
REFRESH_PAGE 不能再被迫创建新 URL。

### 7. PublishedMediaRef
R2 是源资产仓，不把临时 Signed URL 永久写进公开内容。

### 8. AuditEvent + RuntimeControl
“一键暂停发布”和“谁批准了什么”都必须真实落库。

### 9. REMOTE_STATE_UNKNOWN
外部 publish timeout 时不得盲重试。

### 10. URLIdentityService
GSC、GA4、Citation、Publication、Canonical URL 使用统一身份归一化。

### 11. Publication ↔ Citation
可识别 AI 引用来自我们发布到知乎/CSDN/头条等受控资产，而不仅是自有域名。

### 12. Experiment Window 明确
SEO/GEO point-in-time 与 GA4/GSC period window 分开。

## C. 发布最终模型

### C1. Wechatsync
**定位：文章 Draft Stager。**

- 使用本地浏览器已登录态；
- 内容/图片进入平台草稿；
- 草稿 ID/URL 进入系统；
- 不把“草稿成功”视为公开发布。

### C2. Same-draft Finalizer
**定位：把 Wechatsync 创建的同一草稿变成公开内容。**

执行策略：
1. `IN_PAGE_WEB_API`；
2. `FIXED_DOM`；
3. 不做自由 Browser Agent。

### C3. yxer
**定位：独立 Native Publisher / 覆盖加速器。**

- 不要求先经过 Wechatsync；
- 不能假设能消费 Wechatsync 的 platformDraftId；
- 避免产生双份草稿/双份帖子；
- 一个 ReleaseTarget 只能选择一种执行路线。

### C4. social-auto-upload
图文/视频创作者平台 Native Executor。

### C5. Postiz
海外/API 渠道 Native Executor，独立服务运行。

### C6. 正式媒体投放
可对接商业媒体服务 CLI/API（如媒大大类服务）。

**付费媒体投放必须有单独的 Spend Approval，不能由普通 Release Approval 自动授权扣费。**

## D. 安全边界

禁止：
- CAPTCHA solver；
- 2FA bypass；
- stealth fingerprint bypass；
- 从服务端下发任意 JS 给浏览器执行；
- 把浏览器 Cookie 上传主服务；
- `publish` 失败后无确认地无限重试；
- 未通过 Finalizer Certification 的平台直接自动公开发布；
- 第三方依赖生产环境自动升级；
- 复制无 License 的 yxer 源码进入主仓。

## E. 不引入的新基础设施

P0 不引入：
- LangGraph/CrewAI 作为主 runtime；
- n8n；
- Temporal；
- Kafka；
- Neo4j；
- Qdrant；
- 自建向量库；
- 自研多租户 Secret Vault；
- 第二套 CRM。
