# V0.x → V1.0 Migration Notes

## V0.1保留
SEO+GEO统一Search Growth、keyword+prompt、evidence-first、MVP闭环、one agent+skills+workflow。

## V0.2保留
OpenSEO host、GA4 P0、Fresh GEO、Opportunity、immutable release/security/experiment。

## V0.3 Hardening吸收
SearchTopic/Market/Entity、Raw/Parse separation、score profiles、OwnedSite safe update、PublishedMediaRef、Audit/RuntimeControl、RemoteUnknown、URLIdentity、CAS、classification/retention、gold set/confidence、experiment windows。

## V0.4 Publishing吸收
核心改为：
`Release → ExecutionPlan → Wechatsync Draft Stager → Same-Draft Finalizer → Public Verification`
并加入 yxer external executor、social-auto-upload、Postiz、route isolation、per-platform certification。

## 不采纳
- 长期停草稿
- 每个平台人工点发布
- free-form Browser Agent
- 复制yxer/Wechatsync源码进主仓
- 新大基础设施
- task accepted=published
- 失败route无对账直接换route重建内容

## Frozen Thesis
**目标不降低，执行方式分层。**
复杂平台用 staging/fixed finalizer/native service/reconciliation/certification 解决；风险用 one approval/state/kill switch/audit/no bypass/pin/public verify 控制。
