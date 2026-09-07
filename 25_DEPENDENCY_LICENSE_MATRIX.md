# Dependency / Reuse / License Matrix — V1.0

> Star 仅是调研参考。生产必须 pin exact commit/release。

| Project                             | License/状态                                                                              | V1.0角色                   | 集成方式                | 主仓复制   |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------- | ----------------------- | ---------- |
| every-app/open-seo                  | MIT                                                                                       | Host                       | Fork                    | 是         |
| aaron-he-zhu/aaron-marketing-skills | Apache-2.0                                                                                | Skill方法                  | 精选Contract            | 可按Notice |
| AgriciDaniel/claude-seo             | MIT                                                                                       | SEO方法参考                | reference               | 不必       |
| yaojingang/GEORank                  | Apache-2.0 code                                                                           | GEO参考                    | reference               | 否         |
| wechatsync/Wechatsync               | repo/root按现有开源声明治理；研究pin中 `packages/cli/package.json` 标 MIT，存在组件级差异 | Article Draft Stager       | Local external runtime  | 否         |
| yixiaoer888/yixiaoer-skill / yxer   | repo未声明License；npm索引曾显示UNLICENSED                                                | Coverage Executor          | Official CLI/service    | **否**     |
| dreammis/social-auto-upload         | MIT                                                                                       | creator executor           | isolated Python worker  | 不必       |
| gitroomhq/postiz-app                | AGPL-3.0                                                                                  | overseas publisher         | independent service/API | 否         |
| RyanYipeng/SyncCaster               | MIT                                                                                       | hybrid publisher reference | reference               | 否         |
| crawlab-team/artipub                | BSD-3-Clause                                                                              | workflow参考               | reference               | 否         |
| browserbase/stagehand               | MIT                                                                                       | P1 browser fallback研究    | optional P1             | P0否       |

## OpenSEO

冻结 `3632f408528cd588fec98c3a174af8ea0ad205e8`。
复用 Project/Keyword/Rank/Audit/GSC/GA4/AI Search/SearchOpportunity/Workflow/Auth/MCP/Deployment。

## Wechatsync

研究 pin `a98e42865387285afcc027c61836488748f3b30f`。
只作为外部 Local Runtime；不把 GPL 源码 vendor 到 proprietary host。

## yxer

调研：

- GitHub Release `v3.2.15` 存在；
- README 推荐 npm/official binary；
- repo metadata 未声明 License；
- npm搜索缓存曾显示 UNLICENSED。
  因此不复制、不fork修改为产品组件、不重新分发二进制。只调用企业/官方 CLI/服务；商业条款由公司账号/合同确认。

## Postiz

AGPL 独立服务。进程隔离不是法律意见；商业化前正式审查网络服务义务。

## Source-copy Policy

任何 copied code 记录 repo/commit/file/license/modification/notice。
模板：`templates/THIRD_PARTY_NOTICES_TEMPLATE.md`

禁止“AI重写后就没有原License”的错误做法。
