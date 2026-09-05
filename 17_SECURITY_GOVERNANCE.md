# Security & Governance V1.0

## 1. Trust Boundaries

Trusted：
- server domain logic；
- DB；
- configured deployment secrets。

Semi-trusted：
- DataForSEO；
- AI providers；
- Postiz；
- yxer commercial service；
- CMS API。

Untrusted：
- crawled web；
- generated/imported HTML；
- arbitrary external URLs；
- external platform pages；
- manual AI answers。

## 2. SSRF

所有 server outbound URL 走 `SafeOutboundUrl`：
- block localhost/private/link-local/metadata；
- allow http/https only；
- DNS resolve 后再次检查；
- redirect 每跳检查；
- 限 redirect count。

## 3. XSS

- preview sanitize；
- HTML renderer sanitize；
- no unsafe raw HTML without sanitizer；
- Markdown links safe URL。

## 4. Prompt Injection

Retrieved web content 永远标记 untrusted data。

不执行网页中的：
- instructions；
- tool calls；
- publish requests；
- credential requests。

## 5. Credentials

P0 内部/单组织：
- cloud API keys：deployment secrets；
- browser sessions：local only；
- yxer API key：Local Bridge/运营机 secure config；
- 不做自研多租户 secret vault。

## 6. Local Bridge

- scoped token；
- token hash server side；
- project binding；
- protocol version；
- heartbeat；
- job lease；
- revoke；
- signed assets；
- receipt must bind job/bridge。

## 7. Browser Finalizer

- allowlisted domains；
- static finalizer code；
- server 不能下发任意 JS；
- no cookie export；
- CAPTCHA/2FA stop；
- no stealth。

## 8. Approval

普通渠道：
- Evidence Gate；
- Release Dry Run；
- one human approval；
- exact bundle hash。

付费媒体：另加 spend approval。

## 9. Runtime Kill Switch

DB `runtime_controls`：
- global publishing pause；
- platform pause；
- reason/actor/time。

所有执行入口 server-side enforce。

## 10. Audit

Append-only：
- actor；
- project；
- action；
- object；
- before/after refs；
- correlation id；
- time。

不记录 token/cookie/auth header。

## 11. Rate & Blast Radius

配置：
- MAX_RELEASE_TARGETS；
- MAX_RELEASES_PER_DAY；
- MAX_POSTS_PER_PLATFORM_PER_DAY；
- MIN_PLATFORM_INTERVAL；
- GEO cost limit。

## 12. Data Classification

PUBLIC_MARKETING / INTERNAL / RESTRICTED。

## 13. Retention Default

建议初始：
- provider debug raw payload：30d；
- AI raw answers：180d，可配置；
- structured metrics：长期；
- publication receipts：长期；
- audit：长期；
- source media：project lifecycle。

最终按企业政策调整。

## 14. Third-party Supply Chain

- pin tested versions；
- verify checksum where provided；
- no production auto-update；
- stage smoke before upgrade；
- keep notices/license inventory。
