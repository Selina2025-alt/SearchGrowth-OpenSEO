# Platform Certification Matrix — V1.0

状态：
`UNVERIFIED → DRAFT_SMOKE_PASSED → FINALIZE_SMOKE_PASSED → PUBLIC_VERIFY_PASSED → CERTIFIED`

| Platform | Intent | Stager/Executor | Finalizer | P0 |
|---|---|---|---|---|
| Website CMS | PUBLIC | OwnedSiteAdapter | CMS API | YES |
| 知乎 | PUBLIC | Wechatsync | same-draft local finalizer | YES |
| 掘金 | PUBLIC | Wechatsync | same-draft local finalizer | YES |
| CSDN | PUBLIC | Wechatsync | same-draft local finalizer | YES |
| 今日头条 | PUBLIC | Wechatsync/yxer | yxer/fixed DOM after smoke | group |
| 百家号 | PUBLIC | Wechatsync/yxer/social worker | yxer/fixed DOM | group |
| 小红书 | PUBLIC | yxer/social-auto-upload | local executor | group |
| 抖音 | PUBLIC | yxer/social-auto-upload | local executor | group |
| 微信公众号 | PUBLIC/DRAFT按账号政策 | Wechatsync/yxer | certified authorized route | optional |
| LinkedIn/X/etc | PUBLIC | Postiz | API service | GLOBAL one |
| Formal paid news media | PAID/SUBMIT | selected vendor | service API/CLI | P1 |

## Certification Evidence
保存：
- platform/executor
- exact version/commit
- account/test profile
- content type/intent
- draft/finalize/public-verify timestamps
- constraints snapshot
- auth requirements
- known failures
- certified_by
- recheck policy

## Recertification
executor升级、平台大改、连续失败、auth/schema改变 → `CERTIFIED → SUSPENDED`，重新 smoke。

## P0 Core
中国建议：Website + Zhihu + Juejin + CSDN + Toutiao/Baijiahao/XHS/Douyin 任一，全部 `PUBLIC_VERIFIED`。
GLOBAL 再加一个 Postiz target。
