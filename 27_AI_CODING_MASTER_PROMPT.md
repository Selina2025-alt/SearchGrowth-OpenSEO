# AI Coding Master Prompt — Search Growth V1.0

你是本项目总工程师。基于 `every-app/open-seo` frozen commit
`3632f408528cd588fec98c3a174af8ea0ad205e8`
开发 Search Growth MVP V1.0。先完整阅读本包。

## Success
必须真实跑通：
`Project → Search/GEO Baseline → Opportunity → Content/Evidence → Release → Multi-platform PUBLIC_VERIFIED → Search/GEO/GA4 Recheck → Experiment → Next Action`

PUBLIC target 只有 `PUBLIC_VERIFIED` 算成功。

## Phase 0
先跑 OpenSEO install/migrate/format/types/lint/test/build，阅读 Project Context、AI Search、Prompt Explorer cache、Brand Lookup、GSC、GA4、SearchOpportunityService、RankCheckWorkflow、scheduler、R2/deploy、D1/PG。
输出 `IMPLEMENTATION_BASELINE.md`。重大冲突先报告，不自由换架构。

## Phase 0.5
发布先做技术PoC：
1. Wechatsync 知乎草稿；
2. 同 draft final publish + public URL；
3. 掘金重复；
4. CSDN重复；
5. yxer install/doctor/accounts/schema/validate/dry-run/publish/query/public verify；
6. social-auto-upload one platform；
7. GLOBAL时 Postiz one platform。
输出 `CONNECTOR_BASELINE.md`。

## Reuse
不建立第二套 Project/Keyword/Rank/GSC/GA4/Competitor。
OpenSEO existing SEO Opportunity 是 input，不是新建竞争系统。

## GEO Hard Rules
- repeated sampling不得读Prompt Explorer缓存；
- 3 repeats=3 provider calls；
- Raw immutable，Parse versioned；
- Surface分开；
- provenance完整；
- Gold Set；
- count/confidence，拒绝伪精确。

## Domain
实现 SearchMarketProfile、SearchTopic stable ID、TrackedEntity/EntityAlias、Prompt Version。
Keyword本体复用 OpenSEO。

## Opportunity
明确 profiles：EXISTING_GOOGLE_PAGE / EXISTING_SEARCH_PAGE_PARTIAL / NEW_TOPIC / GEO_DISTRIBUTION / EVIDENCE_ONLY。
missing != 0，LLM只能解释，PageFit前置。

## Content
Canonical Markdown + metadata + asset refs + claims/sources。
必须有 Claim Gate、Immutable Version、WebPageSpec、Conversion Gate、Classification、Media Rights。

## Distribution
禁止简化为 `publish(content)`。
必须：
`ReleaseBundle → PublicationExecutionPlan → Route → Receipt → PublicVerification`

Routes：
- OWNED_SITE
- WECHATSYNC_STAGED_FINALIZE
- YXER_NATIVE
- SOCIAL_AUTO_UPLOAD_NATIVE
- POSTIZ_NATIVE
- PAID_MEDIA_SERVICE(P1)

## Wechatsync
Article Draft Stager。P0 Zhihu/Juejin/CSDN。
Draft只是中间态；same-draft finalizer必须把同一draft变成public。
外部GPL runtime，不复制主仓。

## Finalizer
只允许 `IN_PAGE_WEB_API` 或 `FIXED_DOM` 的预编译 allowlisted 实现。
正常浏览器登录；server不得下发任意JS；不绕CAPTCHA/2FA；无stealth。

## yxer
External Coverage Executor。
硬规则：
`publish ok/taskSetId != published`
流程：
`validate → dry-run → publish → ACCEPTED_REMOTE_TASK → query details/records → terminal → public verify`
taskSetId已有时禁止重发。不能把Wechatsync draftId当yxer taskSetId。
不复制源码，不runtime update。

## Owned Site
inspect/create/update/before snapshot/optimistic concurrency/permanent media/verify。REFRESH_PAGE不能变NEW_PAGE。

## Safety
Immutable Release、hash、Dry Run、一次业务审批、DB kill switch、blast limits、idempotency、legal transitions、CAS、audit。
审批后不要求逐平台人工点发布；auth过期用 AUTH_REQUIRED，恢复后继续。

## Remote Unknown
timeout → REMOTE_STATE_UNKNOWN → task/draft/public/fingerprint reconcile；确认未执行才重试。

## Media
R2只是source asset；平台/CMS上传形成 PublishedMediaRef。

## Attribution
UTM campaign `sg_<release_short_id>`；复用OpenSEO GA4 traffic acquisition。
Citation URL匹配Receipt后标 CONTROLLED_PUBLICATION。

## Workflow
Server long task沿用Cloudflare Workflows；Local publishing是leased job+receipt+reconciler。不要让Workflow无限等离线电脑。

## Security
SSRF/XSS/prompt-injection/Cookie-local/scoped bridge/signed asset/audit/retention/classification。
P0不自研multi-tenant vault。

## 禁止引入
n8n、Temporal、Kafka、LangGraph/CrewAI核心、Neo4j、Qdrant、Vector DB、第二CRM、free-form Browser Agent、CAPTCHA solver、stealth、programmatic SEO mass pages。

严格按 `23_BACKLOG_MILESTONES.md` 小PR开发。
缺外部依赖标 `BLOCKED_BY_EXTERNAL_DEPENDENCY`；不能mock成生产成功，也不能偷偷改成人工发布。
