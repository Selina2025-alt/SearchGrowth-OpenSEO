# Distribution Architecture V1.0

## 1. 目标

完成：

```text
Approved Content
→ Platform execution
→ Public URL
→ Verification
→ Receipt
```

而不是“把内容交给一个插件”。

## 2. PublicationExecutionPlan

每个 ReleaseTarget 在执行前解析成固定计划：

```json
{
  "targetIntent": "PUBLIC",
  "route": "WECHATSYNC_STAGED_FINALIZE",
  "platform": "zhihu",
  "accountId": "...",
  "draftStager": "wechatsync",
  "finalizer": "zhihu-same-draft-v1",
  "finalizerStrategy": "IN_PAGE_WEB_API",
  "verificationProfile": "zhihu-public-v1",
  "required": true,
  "fallbackRoute": null
}
```

运行时 Agent 不临时决定平台怎么发。

## 3. 路由

### OWNED_SITE
企业官网。

### WECHATSYNC_STAGED_FINALIZE
文章平台优选：
```text
Stage draft → Verify draft → Finalize same draft → Verify public
```

### YXER_NATIVE
蚁小二原生 CLI 流程。

### SOCIAL_AUTO_UPLOAD_NATIVE
创作者/视频平台。

### POSTIZ_NATIVE
海外/API 社交渠道。

### PAID_MEDIA_SERVICE
商业媒体服务。

## 4. Route exclusivity

同一个 ReleaseTarget 只能选择一种 route。

禁止：
- Wechatsync 已建草稿后又 yxer 创建第二份同内容公开文章，除非显式迁移计划；
- 多个 Executor 同时抢同一 target。

## 5. Website First

默认 SEO/GEO 内容：

```text
website PUBLIC_VERIFIED
→ secondary required targets start
```

原因：
- 建立 canonical source；
- secondary 内容可引用官网；
- publication/citation attribution 清晰。

Operator 可明确 override。

## 6. One Approval

普通免费/自有渠道：ReleaseBundle 一次业务审批。

审批后：
- 自动 stage；
- 自动 finalize；
- 无需用户再逐个平台点击发布。

如果出现登录/验证码/2FA：
- 状态 `AUTH_REQUIRED`；
- 账号持有人恢复身份；
- Workflow 继续。

## 7. Paid Media

Spend Approval 与 Release Approval 分离。

普通 Release Approval 不授权：
- 扣款；
- 下媒体订单；
- 超预算。

## 8. Public Success

`PUBLIC_VERIFIED` 至少要求：
- 公开 URL 或可验证 public ID；
- 不是 edit/draft URL；
- title/content fingerprint 基本匹配；
- 目标无需登录即可访问（平台本身公开内容场景）。

## 9. Unknown Remote State

Timeout/网络断开后：
- 不自动重新 publish；
- 先 reconcile；
- 查 draft/public records/fingerprint；
- 无法确认 → `REMOTE_STATE_UNKNOWN` / manual inspect。

## 10. Global Controls

- global publishing pause；
- per-platform pause；
- max targets/release；
- max releases/day；
- max posts/platform/day；
- minimum interval。
