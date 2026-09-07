# Wechatsync Draft Stager Spec V1.0

## 1. 定位

Wechatsync 的 P0 职责：

> **把 approved 内容可靠同步到目标平台草稿，并返回可追踪 Draft Identity。**

草稿不是 Public Success。

## 2. Research Pin

`wechatsync/Wechatsync`
v2 commit:
`a98e42865387285afcc027c61836488748f3b30f`

该 commit 的 CLI package：

- `@wechatsync/cli`
- version `1.1.0`
- binary `wechatsync`

实施仍需真实 Extension/CLI/MCP smoke。

## 3. 为什么生产 Stager 不只解析 CLI stdout

研究 pin 中：

```text
wechatsync sync <file> --platforms zhihu,juejin
```

CLI 会从 Extension Bridge 收到 `SyncResult[]`，其中底层结果包含 `postId/postUrl/draftOnly`；
但 CLI 人类可读 stdout 主要打印平台、草稿标志和 `postUrl`，不会稳定输出完整 `postId` JSON。

而 V1.0 Same-Draft Finalizer 必须有可靠 `external_draft_id`。

因此：

- **CLI 用于安装验证、人工Smoke、dry-run。**
- **生产 `WechatsyncDraftStager` 优先调用其 MCP/Extension Bridge 的结构化 `syncArticle` result contract，保留原始 `SyncResult`。**
- 如果未来官方 CLI 提供稳定 `--json` 输出，也可以切回 CLI Adapter。
- 禁止从 UI 文本猜 draft id。
- 如果某平台 draft URL 能解析 id，也只能作为 verification，不是主身份来源。

## 4. Local Runtime

运营机：

- Chrome 正常登录平台；
- Wechatsync Extension；
- Extension 开启 MCP/同步桥接；
- Local Publisher Bridge 与 Wechatsync MCP/bridge 通信。

平台 Cookie 不离开浏览器。

## 5. DraftStager Interface

```ts
interface DraftStagerAdapter {
  id: string;
  health(): Promise<Health>;
  capabilities(platform: string): Promise<DraftCapabilities>;
  stage(input: StageDraftInput): Promise<PlatformDraftResult>;
  inspect(ref: PlatformDraftRef): Promise<DraftInspection>;
}
```

## 6. Stage Input

- exact ContentVersion hash
- platform variant
- asset refs
- account mapping
- platform fields
- release target id
- local idempotency key

## 7. Stage Output

必须结构化保存：

```text
platform
account_id
external_draft_id
external_draft_url
content_hash
media_hashes
stager_id
stager_version
raw_result_safe
created_at
verification_status
```

没有 `external_draft_id`：
不能进入 Same-Draft Finalizer；
必须先通过结构化 bridge 或 platform inspect 补全。

## 8. Draft Verification

至少：

- draft id存在
- draft URL/inspect可访问（若能力支持）
- title match
- content fingerprint
- expected account/platform
- asset count/关键图像（能力允许时）

失败不能 Finalize。

## 9. Idempotency

Wechatsync未承诺跨调用幂等时：

1. release target 已有 verified draft → 不重复 stage；
2. stage前 CAS `EXECUTION_READY → STAGING_DRAFT`；
3. stage返回后先持久化 remote identity；
4. Bridge重启只 inspect/reconcile，不自动再 create。

若网络在 create 后断开：
`REMOTE_STATE_UNKNOWN`，先 `getDrafts`/平台草稿列表/指纹对账。

## 10. 内容与图片

优先使用 Wechatsync 已有：

- Markdown/HTML转换
- 平台预处理
- 图片转存
- cover/tags/capability（以真实adapter为准）

V1 Content Renderer 负责业务表达；Wechatsync负责平台技术适配。

## 11. Known Errors

- AUTH_REQUIRED
- PLATFORM_UNAVAILABLE
- DRAFT_CREATE_FAILED
- IMAGE_UPLOAD_FAILED
- FORMAT_REJECTED
- RATE_LIMITED
- BRIDGE_OFFLINE
- REMOTE_STATE_UNKNOWN
- UNKNOWN

## 12. P0 Platforms

优先认证：

1. Zhihu
2. Juejin
3. CSDN

之后才扩 Toutiao/Baijiahao 等。

## 13. 明确不做

- Cookie上云
- vendor整个Wechatsync源码
- 把其Roadmap未完成的Direct Publish当现成功能
- 从CLI彩色stdout脆弱地正则猜postId
- CAPTCHA/2FA绕过
