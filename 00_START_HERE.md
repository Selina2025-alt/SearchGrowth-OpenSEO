# Search Growth MVP V1.0 — START HERE

**版本**：1.0 Final Development Baseline  
**日期**：2026-09-05  
**目标**：在 OpenSEO 上快速落地一个真正可运行的 B2B SEO × GEO Search Growth 闭环：发现需求 → 判断机会 → 生产可信内容 → 自动发布 → 获得公开 URL → 搜索/AI 可见性与 GA4 回流 → 下一轮优化。

---

## 1. 这不是一个“SEO Dashboard”

系统必须跑通：

```text
Business Target
→ Search Demand
→ SEO / GEO Baseline
→ Opportunity
→ PageFit / Cannibalization
→ Content + Evidence
→ Release Approval
→ Public Distribution
→ Public URL Verification
→ Crawl / Index / Citation / GA4
→ Experiment Recheck
→ Next Action
```

### 发布成功的唯一主口径

对于目标为 `PUBLIC` 的渠道：

> **只有 `PUBLIC_VERIFIED` 才算发布成功。**

以下都不算：

- “命令执行成功”；
- “taskSetId 创建成功”；
- “草稿已生成”；
- “平台显示已提交”；
- “点击了发布按钮”。

---

## 2. V1.0 核心架构决策

### Host

- `every-app/open-seo`
- 冻结基线 commit：`3632f408528cd588fec98c3a174af8ea0ad205e8`
- OpenSEO 已有能力优先复用，不平行重建。

### Agent 模型

- **1 个 Search Growth Agent**；
- 通过 Skill 调专业能力；
- Tool 做数据/执行；
- Workflow 保证状态、审批、重试、回滚和审计。

### 发布模型

V1.0 不再使用一个过度抽象的 `publish(content)`。

```text
ReleaseBundle
  ↓
Distribution Controller
  ↓
PublicationExecutionPlan
  ├─ OWNED_SITE
  ├─ WECHATSYNC_STAGED_FINALIZE
  ├─ YXER_NATIVE
  ├─ SOCIAL_AUTO_UPLOAD_NATIVE
  ├─ POSTIZ_NATIVE
  └─ PAID_MEDIA_SERVICE (可选/需单独预算审批)
  ↓
PublicationReceipt
  ↓
Public Verification
```

### 文章平台首选路线

```text
Canonical Content
→ Wechatsync 草稿同步
→ PlatformDraft
→ 同一草稿的 Certified Finalizer
→ Public URL
```

Wechatsync 是 **Draft Stager**，不是最终发布成功口径。

### 蚁小二 yxer

- 作为 **外部 Coverage Accelerator / Native Publisher**；
- 不复制、不修改其未声明 License 的源码；
- 通过 CLI 契约调用；
- `publish` 返回 `taskSetId` 只能视为 `ACCEPTED`，必须继续查询任务详情并做公开 URL 验证；
- 不把 yxer 当作“自动完成 Wechatsync 外部草稿”的能力，除非未来明确验证二者 draft identity 可互操作。

---

## 3. 开发阅读顺序

1. `01_FINAL_DECISIONS.md`
2. `02_PRODUCT_REQUIREMENTS_PRD.md`
3. `03_SYSTEM_ARCHITECTURE.md`
4. `04_OPENSEO_REUSE_CODE_MAP.md`
5. `05_DOMAIN_DATA_MODEL.md`
6. `06_SEO_SEARCH_ENGINE_SPEC.md`
7. `07_GEO_MEASUREMENT_SPEC.md`
8. `08_OPPORTUNITY_ENGINE_SPEC.md`
9. `09_CONTENT_EVIDENCE_WEBPAGE_SPEC.md`
10. `10_DISTRIBUTION_ARCHITECTURE.md`
11. `11_WECHATSYNC_DRAFT_STAGER_SPEC.md`
12. `12_YXER_INTEGRATION_REPORT.md`
13. `13_PUBLISH_FINALIZER_SPEC.md`
14. `14_MEDIA_SOCIAL_PUBLISHING_SPEC.md`
15. `15_MEDIA_ASSET_SPEC.md`
16. `16_ATTRIBUTION_EXPERIMENT_SPEC.md`
17. `17_SECURITY_GOVERNANCE.md`
18. `18_WORKFLOW_STATE_MACHINES.md`
19. `19_API_CONTRACTS.md`
20. `20_DATABASE_SCHEMA_GUIDE.md`
21. `21_TEST_ACCEPTANCE_PLAN.md`
22. `22_DEPLOYMENT_RUNBOOK.md`
23. `23_BACKLOG_MILESTONES.md`
24. `24_RISK_REGISTER.md`
25. `25_DEPENDENCY_LICENSE_MATRIX.md`
26. `26_PLATFORM_CERTIFICATION_MATRIX.md`
27. `27_AI_CODING_MASTER_PROMPT.md`
28. `28_DEVELOPMENT_PREREQUISITES.md`
29. `29_SCOPE_LOCK.md`
30. `30_TRACEABILITY_MATRIX.md`
31. `31_RESEARCH_SOURCE_SNAPSHOT.md`
32. `32_V1_MIGRATION_NOTES.md`
33. `33_IMPLEMENTATION_ORDER_ONE_PAGE.md`
34. `34_FIRST_CODEX_TASK.md`

Supporting engineering artifacts:

- `schemas/` — domain types, OpenAPI, state machines, migration reference
- `scripts/` — SkillHub/yxer/Wechatsync install & smoke scripts
- `reference-implementations/` — safe executor/finalizer/state patterns
- `skills/` — 10 Search Growth Skill contracts
- `docs/adr/` — frozen architecture decisions
- `templates/` — baseline/release/certification/runtime examples
- `fixtures/` — parser, URL, publishing semantics test fixtures
- `checklists/` — PR/MVP/incident gates

---

## 3.1 yxer 本次验证状态

已经完成源码、Release、README、Issue 和发布工作流的接口级核验；明确确认 yxer 可作为外部发布 Executor 使用。

当前 ChatGPT 执行容器因外网 DNS/包下载受限，**没有伪称已经安装成功**。V1.0 把真实安装和 smoke 固化成 Windows 脚本，必须在运营/开发机执行并将结果写入 `CONNECTOR_BASELINE.md`。

关键语义已经锁死：`yxer publish → taskSetId` 只是远程任务被接受，不能视为公开发布成功；必须查询终态并做 Public Verification。

## 4. 代码实现顺序

**不要从页面开始。不要先做大 Agent。不要先接 20 个平台。**

```text
M0   OpenSEO baseline
M0.5 Connector feasibility spike
M1   Domain + DB + Audit + Runtime controls
M2   Publishing proof: Draft → Public URL
M3   GEO fresh measurement
M4   Opportunity + PageFit
M5   Content + Claims + Media
M6   Full Release / Distribution
M7   Index + GA4 + Experiment
M8   Security + E2E + Release Gate
```

---

## 5. V1.0 MVP 真实验收

至少跑通一个真实站点：

1. Project/ICP/Product/Market 配置；
2. 50–100 个真实关键词；
3. 30–50 个 GEO Prompt；
4. 至少 2 个 AI Observation Surface × 3 次 fresh samples；
5. Top 10 Opportunities；
6. 选择 1 个 Opportunity，完成 PageFit；
7. 生成 Content Package + Claims/Evidence；
8. 一次 Release Approval；
9. 官网 create/update 并 `PUBLIC_VERIFIED`；
10. 至少 3 个文章平台完成公开发布；
11. 至少 1 个额外社交/海外/服务商渠道完成公开发布；
12. 至少 5 个 `PUBLIC_VERIFIED` URL；
13. 保存 Publication Receipt；
14. Crawl/Index observation；
15. Citation 与 Publication URL 可匹配；
16. GA4 UTM 可归因到 Release；
17. Experiment baseline + recheck；
18. 输出下一步 Action。

工程闭环可以验收；**排名、AI 推荐和自然流量提升不做结果保证。**

---

# AI Dual-Agent Orchestration Addendum (V1.1)

The product baseline remains **V1.0**. The development pack now includes an orchestration layer for:

- **Codex** as Controller / Architect / TPM / Reviewer / Acceptance Owner;
- **Claude Code CLI** as Implementation Engineer;
- **Human** as final Product Owner and production authority.

Start with root `AGENTS.md`, `CLAUDE.md`, then read:

- `35_AI_DUAL_AGENT_ORCHESTRATION.md`
- `38_HUMAN_GATES.md`
- `39_AI_ENVIRONMENT_SETUP.md`
- `40_ONE_MESSAGE_TO_CODEX.md`
- `44_REPOSITORY_BOOTSTRAP.md`

The direct automation path is Codex local → terminal → `claude -p`, not UI-click automation of the VS Code sidebar.

Run `.ai-orchestrator/probe-environment.ps1` before autonomous dispatch.

## V1.2 Windows / DeepSeek compatibility note

This machine has successfully executed:

```text
claude.cmd --version → 2.1.261
claude.cmd -p ... → EXECUTOR_OK
```

The CLI output also referenced `deepseek-v4-Pro[1m]`, so the custom model route is visible to the CLI. Bare `claude` is blocked by PowerShell because it resolves to `claude.ps1`; V1.2 orchestration therefore auto-prefers `claude.cmd`. stderr warnings are stored separately from JSON stdout.
