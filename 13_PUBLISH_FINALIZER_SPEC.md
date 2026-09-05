# Same-Draft Publish Finalizer Spec V1.0

## 1. 目标

让 Wechatsync 已创建并验证的 `PlatformDraft` 在无需第二次业务审批的情况下自动正式公开。

## 2. 为什么是 Same Draft

- 不重复生成内容；
- 不留“一个草稿 + 一篇新发文章”脏数据；
- draft content/hash 可校验；
- 发布前后 identity 可追踪。

## 3. Finalizer Strategy

### IN_PAGE_WEB_API
在用户正常登录的目标站点同源上下文中调用编辑器自己使用的 Web API。

适合：
- 知乎；
- 掘金；
- CSDN 等通过 smoke 认证的核心平台。

注意：这些是认证后的 Web Editor API，不宣传为稳定的公开 Developer API。

### FIXED_DOM
打开明确 draft URL，执行固定 DOM 逻辑：
- 检查 title/draft id；
- 填补 publish-only fields；
- 点击明确 publish action；
- 读取结果。

适用于 Web API 不稳定/不易直接调用的平台。

## 4. Companion Runtime

推荐本地小组件：`Publisher Companion`。

职责：
- 与 Local Bridge 通讯；
- 运行静态注册 Finalizer；
- 使用当前 Chrome 正常登录态；
- 返回结果/证据。

**Server 不可下发任意 JavaScript。**

Job 只包含：
```text
finalizer_id
platform
draft_id
draft_url
expected_content_hash
publish_fields
```

## 5. Interface

```ts
interface SameDraftFinalizer {
  id: string;
  platform: string;
  strategy: 'IN_PAGE_WEB_API'|'FIXED_DOM';
  inspectDraft(ref): Promise<DraftInspection>;
  requirements(ref): Promise<PublishRequirements>;
  dryRun(input): Promise<FinalizerDryRun>;
  finalize(input): Promise<FinalizeSubmission>;
  reconcile(input): Promise<FinalizeState>;
  verifyPublic(input): Promise<PublicVerification>;
}
```

## 6. 第一批认证目标

建议顺序：
1. 知乎；
2. 掘金；
3. CSDN。

GitHub 已有多个项目展示草稿创建/正式 publish 的实现，可借 endpoint/workflow 方法，但 V1.0 自己按真实账号重新抓取/验证 contract，不直接复制未知质量代码。

## 7. State

```text
DRAFT_VERIFIED
→ FINALIZE_READY
→ FINALIZING
→ PUBLISH_SUBMITTED
→ PUBLIC_VERIFYING
→ PUBLIC_VERIFIED
```

异常：
- AUTH_REQUIRED
- PUBLISH_FIELDS_REQUIRED
- RATE_LIMITED
- REMOTE_STATE_UNKNOWN
- REJECTED
- FINALIZE_FAILED
- VERIFY_FAILED

## 8. Remote Unknown

如果 finalize 请求 timeout：
- 不再次 finalize；
- reconcile draft state；
- 查 public list / known URL / fingerprint；
- 有 public evidence → verify；
- 无法确认 → `REMOTE_STATE_UNKNOWN`。

## 9. Verification Profiles

每个平台固定：
- public URL regex；
- edit/draft URL blacklist；
- title check；
- content fingerprint；
- account/author check（可获取时）；
- login-wall check。

## 10. Finalizer Certification

```text
IMPLEMENTED
→ DRAFT_SMOKE_PASSED
→ FINALIZE_SMOKE_PASSED
→ PUBLIC_VERIFY_PASSED
→ CERTIFIED
```

只有 CERTIFIED 进入 unattended `PUBLIC` Release。

## 11. Repair

平台 UI/API 变化：
- 自动将该 Finalizer `DEGRADED/DISABLED`；
- 其它平台不受影响；
- 修复后重新 smoke/certify。

## 12. 不做

- stealth；
- CAPTCHA solving；
- 通用 browser agent；
- 任意 selector 自学习后直接生产执行；
- 账号密码抓取。
