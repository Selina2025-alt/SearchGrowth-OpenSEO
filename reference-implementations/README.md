# Reference Implementations

这些文件不是“复制粘贴即生产”的替代品，而是为了让 AI Coding 不自行发明关键语义。

实施顺序：
1. M0核验 OpenSEO 真实代码约定；
2. 把 reference contract 映射到真实目录；
3. 增加实际 tests；
4. 再接外部 connector。

包含：
- `yxer-process-executor.ts`：安全调用外部 yxer CLI 的模式。
- `url-identity.ts`：Citation/Receipt URL identity。
- `finalizer-contract.ts`：Same-Draft Finalizer 合同。
- `state-transition.ts`：关键状态 Compare-And-Set 约束示例。

禁止把这里的简化错误处理当完整生产实现。
