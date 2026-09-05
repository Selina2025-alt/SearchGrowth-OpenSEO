# yixiaoer-cli（yxer）安装、可用性与 V1.0 集成结论

## 1. 最终结论

**可以直接用，但不建议“改源码后嵌进主项目”。**

V1.0 把 yxer 定位为：

> **外部 Coverage Accelerator / Native Publishing Executor**

最有价值的能力：
- 账号 discovery；
- platform schema / prepare；
- 资源上传；
- validate；
- dry-run；
- local/cloud publish；
- task/details/records query；
- 平台差异字段治理。

我们只写一个安全 Wrapper，把它接进 Search Growth 的 Release/Receipt/Reconcile 状态机。

---

## 2. 按 SkillHub 安装指导得到的安装路径

用户指定入口：
`https://skillhub.cn/install/skillhub.md`

SkillHub CLI-only 的公开安装方式为：

```bash
curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh \
  | bash -s -- --cli-only
```

验证：

```bash
which skillhub
skillhub --help
```

蚁小二 bootstrap skill / 官方公开文档给出的 yxer 标准方式是：

```bash
npm install -g @yixiaoermail/cli@latest
yxer --version
yxer skill sync --global
yxer config init --api-key <apiKey>
yxer doctor
```

也就是说：
**SkillHub 是技能发现/安装入口；yxer 实际 runtime 是官方 npm/二进制 + yxer skill。**
Search Growth 生产运行不依赖 SkillHub 在线。

开发包提供：
- `scripts/install-skillhub-cli.sh`
- `scripts/install-yxer-windows.ps1`
- `scripts/smoke-yxer-windows.ps1`

---

## 3. 本次 ChatGPT 执行环境实际尝试

当前执行容器曾核验：
- Node.js：可用；
- npm：可用；
- Go：可用，但低于 yxer 源码 README 当前要求的 Go 1.25；
- 初始没有 `skillhub`；
- 初始没有 `yxer`。

实际尝试：
1. 读取 SkillHub install URL；
2. 通过执行容器访问安装源；
3. `npm view @yixiaoermail/cli ...`。

该执行容器对外 DNS/包下载受限，实际安装未能完成。

因此本包**不声称 yxer 已在本容器成功安装**。

真正可执行的验收被固化成 Windows 安装/Smoke 脚本，由目标运营机执行并输出 Connector Baseline。

---

## 4. 版本事实

调研时：
- GitHub repository：`yixiaoer888/yixiaoer-skill`
- GitHub Latest Release：`v3.2.15`（2026-09-03）
- Repository README 推荐 npm 安装；
- npm 搜索缓存曾出现较旧版本，说明 registry/index 与 GitHub Release 可能存在时间差。

所以：
- staging 先发现 candidate；
- production 只使用 smoke 通过的 exact version；
- 不允许 Search Growth runtime 自动 `yxer update`；
- exact version 不存在时停止，不 silently fallback to latest。

---

## 5. License 风险

GitHub repository metadata 当前没有声明开源 License；
公开 npm 索引曾标记 `UNLICENSED`。

注意：
“蚁小二一键发布”的 bootstrap skill 在技能市场显示的 License，
不等于 yxer CLI 整个源码仓自动获得同样 License。

所以 V1.0：
1. 不复制 yxer source 到主仓；
2. 不 fork 修改后随产品分发；
3. 不把源码作为我们的内部 library；
4. 只调用官方 CLI/service；
5. 商业使用/账号/API 条款由公司与服务商确认。

这比“改改源码直接用”风险更低，同时保留全部服务能力。

---

## 6. 为什么不能把 `publish ok=true` 当成功

公开 GitHub Issue 已记录真实情况：

```text
doctor OK
accounts OK
validate OK
dry-run OK
publish → ok=true + taskSetId
```

但随后：

```text
query details
→ platform task stageStatus=fail
```

因此 V1.0 强制定义：

```text
yxer publish
→ ACCEPTED_REMOTE_TASK
→ taskSetId
→ query details / records
→ terminal platform state
→ discover/receive public URL
→ Public Verification
→ PUBLIC_VERIFIED
```

**taskSetId 是远端任务身份，不是公开文章成功证明。**

---

## 7. YxerNativeExecutor Contract

```ts
interface YxerNativeExecutor {
  version(): Promise<string>;
  doctor(): Promise<Health>;
  discoverAccount(platform:string): Promise<Account[]>;
  prepare(platform:string,type:string): Promise<PrepareResult>;
  schemaFields(platform:string,type:string): Promise<SchemaContract>;
  uploadAssets(...): Promise<ExternalAsset[]>;
  validate(plan:YxerPlan): Promise<ValidationResult>;
  dryRun(plan:YxerPlan): Promise<DryRunResult>;
  submit(plan:YxerPlan): Promise<{taskSetId:string}>;
  reconcile(taskSetId:string): Promise<RemoteTaskState>;
}
```

参考：
`reference-implementations/yxer-process-executor.ts`

---

## 8. 固定执行顺序

```text
accounts list
→ prepare
→ schema fields/get
→ upload
→ build payload
→ validate
→ publish --dry-run
→ publish
→ taskSetId
→ query details/records
→ terminal state
→ public verification
```

任何一步失败不跳过。

---

## 9. 生产 Wrapper 安全规则

- 用 `spawn(executable,args,{shell:false})`，不拼 shell 字符串；
- server 不能传任意 yxer arguments；
- platform/type 走 allowlist/validation；
- payload/content file 必须来自该 job 的受控 local workspace；
- CLI output 限大小；
- timeout；
- redact token/key；
- 不执行 update；
- 不自动 cloud→local fallback；
- 不自动删除外部内容。

---

## 10. Remote Unknown

如果：
- HTTP/CLI timeout；
- 进程中断；
- taskSetId 未可靠返回；

不能认为“没发出去”。

进入：

`REMOTE_STATE_UNKNOWN`

先：
- query records/details（有已知 task 时）；
- 查最近平台任务；
- 公开内容 fingerprint；
- account/time window；

确认无远端执行后才允许重试。

---

## 11. yxer 与 Wechatsync 不是前后串联的默认路线

### Route A
```text
Wechatsync
→ Platform Draft
→ Same-Draft Finalizer
→ Public
```

### Route B
```text
yxer Native
→ Remote Task
→ Terminal
→ Public
```

除非以后有明确接口证明 draft identity 可互操作，
禁止：

`Wechatsync draftId → yxer taskSetId/finalize`

否则非常容易产生第二篇重复内容。

---

## 12. 什么时候优先用 yxer

- Wechatsync same-draft finalizer 尚未认证的平台；
- 多账号/复杂字段；
- yxer schema/prepare 能覆盖的平台；
- creator/media场景服务商通路比我们自研更成熟；
- 临时快速补渠道覆盖。

---

## 13. 什么时候不用

- 官网；
- 已有认证 Same-Draft Finalizer 的知乎/掘金/CSDN；
- 当前 exact version 对某平台有 blocking bug；
- 没有合法账号/API key/服务授权；
- 需要把其源码嵌入我们商业产品的场景。

---

## 14. V1.0 Verdict

**“直接调用，自己做可靠性控制”优于“改源码”。**

我们自研的资产应是：
- Release/ExecutionPlan；
- yxer wrapper；
- status semantics；
- reconciliation；
- receipt；
- public verification；
- attribution。

平台连接能力本身先复用服务商。
