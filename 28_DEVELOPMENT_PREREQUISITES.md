# Development Prerequisites — V1.0

开工前准备：

1. **OpenSEO/Search**：DataForSEO credential/余额、Google OAuth、GSC、GA4、staging/真实低风险domain。
2. **Project**：brand aliases、products、ICP、personas、markets/languages、2–5 competitors、conversion goal、approved/forbidden claims。
3. **Search Market**：至少 Google+location+language+device；China再加Baidu，不用模糊GLOBAL替代。
4. **Prompt**：≥30中文；GLOBAL +≥10英文，覆盖推荐/比较/安全/风险/实施/场景等。
5. **Website**：CMS create/update/media/public URL/sitemap/robots/canonical权限。
6. **Wechatsync**：Windows Chrome、Extension、正常登录知乎/掘金/CSDN、CLI/MCP可连接。
7. **yxer**：Node/npm、企业API key、账号绑定、本机client（若local）、合法商业账号；跑install+smoke scripts。
8. **social-auto-upload**：如启用，Python/uv + 一个授权平台。
9. **Postiz**：GLOBAL时提供instance/token/test destination。
10. **Content fixture**：一篇800–1500字低风险文章、自有封面/图片、approved和unverified claims。
11. **Parser Gold Set**：30–50条人工标签回答。
12. **角色**：Product/Engineering/Claim Approver/Release Approver/Account Owner/Incident Owner。
13. **首批认证**：Website、Zhihu、Juejin、CSDN、一个中国补充渠道，GLOBAL再加Postiz。

每个外部依赖必须有 owner/version candidate/credential/test/failure/disable 方法，否则标 `BLOCKED_BY_EXTERNAL_DEPENDENCY`。
