# Skill: GEO Measurement

version: 1.0
purpose: fresh、可追溯地测量AI搜索可见性。
tools: MeasurementSamplingService, aggregated AI visibility, manual observation
rules:

- repeated sample不得读取Prompt Explorer应用缓存。
- Raw run immutable；Parse versioned。
- Surface不混算。
- 保存model/version/search mode/market/time。
- 小样本显示count+confidence。
