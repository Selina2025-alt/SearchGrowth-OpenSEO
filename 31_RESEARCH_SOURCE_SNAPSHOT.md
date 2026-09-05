# Research & Source Snapshot — V1.0

## OpenSEO
`https://github.com/every-app/open-seo`
Frozen `3632f408528cd588fec98c3a174af8ea0ad205e8`。
作为Host，复用Project/SEO/GSC/GA4/AI Search/SearchOpportunity/Workflow。

## Wechatsync
`https://github.com/wechatsync/Wechatsync`
Research pin `a98e42865387285afcc027c61836488748f3b30f`。
Adapter支持草稿/图片等；Roadmap说明Direct Publish仍逐平台适配。
V1定位：**Article Draft Stager**。

## yxer
`https://github.com/yixiaoer888/yixiaoer-skill`
调研时GitHub Release `v3.2.15`（2026-09-03）。
能力：accounts/prepare/schema/upload/validate/dry-run/local/cloud publish/draft/query。
公开Issue #8证明 publish accepted/taskSetId 可能后续平台失败。
V1：必须terminal reconcile + public verify；源码不复制。

## Same-Draft References
GitHub公开实现中存在 Zhihu/Juejin/CSDN/Toutiao 草稿→发布逻辑。
这些是实施参考，不是官方稳定API承诺。必须使用正常授权session并逐平台certify。

## social-auto-upload
`https://github.com/dreammis/social-auto-upload`
用于抖音/小红书/视频等creator平台；外部local Python worker。

## SyncCaster
`https://github.com/RyanYipeng/SyncCaster`
MIT、TypeScript，API/DOM hybrid engine、image strategy、job logs、URL recognition。
仅参考架构。

## Postiz
`https://github.com/gitroomhq/postiz-app`
独立服务，海外/API渠道。

## SEO/GEO Skill References
Aaron Marketing Skills、Claude SEO、GEORank、Yao GEO Skills。
只借skill contract和方法，不增加新Agent runtime。

## Source-of-truth Priority
1. pinned source + real smoke
2. official docs/API
3. current platform behavior
4. reputable OSS implementation
5. README claim
6. design assumption
若1–3与开发包冲突，记录baseline/ADR后修实现，不伪造能力。
