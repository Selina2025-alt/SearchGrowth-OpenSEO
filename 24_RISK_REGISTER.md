# Risk Register — V1.0

| ID | 风险 | 影响 | V1.0处置 |
|---|---|---|---|
| R01 | GEO重复采样命中缓存 | 严重 | Fresh path + regression |
| R02 | AI Surface混算 | 严重 | typed surfaces |
| R03 | OpenSEO漂移 | 高 | pin + baseline |
| R04 | 两套Opportunity | 高 | existing SEO signal as input |
| R05 | missing当0 | 高 | score profiles/data quality |
| R06 | Topic漂移 | 中 | stable SearchTopic |
| R07 | Alias误判 | 高 | match modes |
| R08 | Parser重写历史 | 高 | immutable raw/versioned parse |
| R09 | keyword cannibalization | 高 | PageFit |
| R10 | REFRESH覆盖人工更新 | 严重 | optimistic concurrency |
| R11 | 无证据Claim发布 | 严重 | Evidence Gate |
| R12 | R2短链作永久图片 | 高 | PublishedMediaRef |
| R13 | 素材无权利 | 高 | rights_status |
| R14 | 批准后内容变化 | 严重 | immutable hash |
| R15 | Wechatsync停在草稿 | 高 | same-draft finalizer |
| R16 | 平台接口变化 | 中 | certification/pin |
| R17 | yxer accepted误判published | 严重 | query terminal+verify |
| R18 | yxer未声明源码License | 高 | external CLI only |
| R19 | yxer版本源不同步 | 中 | candidate smoke+pin |
| R20 | timeout但远程成功 | 严重 | REMOTE_STATE_UNKNOWN |
| R21 | fallback重复创建 | 严重 | route isolation+reconcile |
| R22 | Cookie泄露 | 严重 | local only |
| R23 | 任意JS下发 | 严重 | allowlisted finalizers |
| R24 | SSRF | 严重 | SafeOutboundUrl |
| R25 | XSS | 高 | sanitize |
| R26 | prompt injection | 高 | untrusted boundary |
| R27 | CAPTCHA/2FA | 中 | AUTH_REQUIRED，无绕过 |
| R28 | social uploader UI drift | 中 | pin/certify |
| R29 | Postiz upgrade drift | 中 | independent pinned service |
| R30 | GPL/AGPL合规 | 高 | isolation + legal review |
| R31 | Kill Switch仅UI | 严重 | DB/server enforcement |
| R32 | 发布量事故 | 严重 | blast limits |
| R33 | Workflow等离线电脑 | 中 | receipt/reconciler |
| R34 | GA4/GSC时区延迟 | 中 | exact windows/timezone |
| R35 | 模型升级假趋势 | 高 | version warnings |
| R36 | 小样本伪精确 | 中 | counts/confidence |
| R37 | Baidu submit不可用 | 中 | NOT_CONFIGURED |
| R38 | 效果不提升 | 中 | 不保证排名 |
| R39 | AI成本失控 | 中 | budget cap |
| R40 | 自研多租户vault | 严重 | P0不做 |
| R41 | Restricted数据外发 | 严重 | classification |
| R42 | Audit缺失 | 高 | append-only audit |
| R43 | 外部内容无法自动回滚 | 中 | 不自动删，事故流程 |
| R44 | 新闻媒体采购混入普通发布 | 高 | 独立spend approval |

### Release Blockers
R01/R02/R08/R10/R11/R14/R17/R20/R21/R22/R23/R24/R25/R26/R31/R32/R40/R41/R42 未解决不得上线。

### 可显式降级
- 某平台 certification失效 → disable该target。
- Baidu submit无权限 → NOT_CONFIGURED，不假成功。
- GA4无Key Event →只看traffic/engagement。
- yxer未配置 → route disabled，不影响Wechatsync core。
- paid media未采购 → P1。
