# Backlog & Milestones — V1.0

## M0 Freeze & Baseline

T000 freeze OpenSEO；T001 build/test；T002 code-map；T003 `IMPLEMENTATION_BASELINE.md`。
**Gate**：源码现实与文档差异解决。

## M0.5 Distribution Feasibility Spike

T050 Wechatsync：知乎/掘金/CSDN draft + result contract。
T051 同草稿 Finalizer：至少一个 draft→public→verify。
T052 yxer：install/doctor/accounts/schema/validate/dry-run/publish/query/public verify。
T053 social-auto-upload：一个平台。
T054 Postiz：一个平台。
T055 `CONNECTOR_BASELINE.md`。
**Gate**：证明 Markdown → Draft → Same Draft Public → Verified URL。

## M1 Core Domain

SearchGrowthTarget、MarketProfile、Topic/keyword refs、Entity/Alias、Prompts、Raw GEO+Parse、Opportunity、Claims/Sources、Content/Media、Release/Distribution、Experiments、Audit/RuntimeControls、D1/PG parity。

## M2 GEO

Surface types、Fresh adapter、Sampling、Workflow、Entity/Citation Parser、versioned parse、Gold Set、metrics/confidence、UI、cache regression。
**Gate**：3 repeats=3 provider calls。

## M3 Opportunity

复用 OpenSEO SearchOpportunityService；Score Profiles；Demand；GEO/Citation Gap；PageFit/Cannibalization；Technical blocker；UI。
**Gate**：只有一套主 Opportunity。

## M4 Content/Evidence/Web

Claim、Source、Brief、Immutable Version、Canonical Markdown、WebPageSpec、Variants、Gate、Conversion Readiness、Classification。

## M5 Media

MEDIA_BUCKET、metadata/hash/rights、asset refs、signed bridge、PublishedMediaRef、CMS media、local hash cache。

## M6 Release Safety

ReleaseBundle/hash/ExecutionPlan/Dry Run/One Approval/Kill Switch/blast limits/state CAS/audit。
**Gate**：批准后不可变且server kill switch有效。

## M7 Owned Site

inspect/create/update/before snapshot/optimistic concurrency/CMS media/verify/sitemap/robots/canonical/index。

## M8 Local Bridge

pair/protocol/heartbeat/lease/CAS/signed asset/executor registry/receipt/reconcile/revoke。

## M9 Wechatsync Draft Stager

wrapper/capability/draft contract/verify + Zhihu/Juejin/CSDN。
**Gate**：3个平台 DRAFT_VERIFIED。

## M10 Same-Draft Finalizers

interface/in-page harness/Zhihu/Juejin/CSDN/REMOTE_UNKNOWN/reconcile/public verify/certification。
**Gate**：3个平台 PUBLIC_VERIFIED。

## M11 Coverage Executors

yxer wrapper+terminal reconcile；social-auto-upload；Postiz；额外 public paths。
**Gate**：不会重复发布，至少两个补充路径通过。

## M12 Search/Attribution

URLIdentity、Citation→Receipt、source ownership、UTM、GA4 campaign、GSC、crawler access、engine separation。

## M13 Experiment

activation/baseline/D7/D14/D30/SEO/GEO/GA4 windows/model warnings/compare/Next Action。

## M14 Security & Full E2E

SSRF/XSS/prompt injection/media rights/bridge scope/kill switch/concurrency/5-target release/docs/backup。
**MVP RELEASE GATE**

## P1

CRM/revenue、Ads、paid-media、更多Finalizer、更多consumer AI、多租户、programmatic SEO、backlinks、多Agent、vector/graph DB。
