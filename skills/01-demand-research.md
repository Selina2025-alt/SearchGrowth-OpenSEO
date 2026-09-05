# Skill: Demand Research
version: 1.0
purpose: 把真实搜索数据、项目目标、现有页面转成 SearchTopic/Keyword/Prompt Demand Map。
inputs: project target, market profiles, OpenSEO keywords/GSC/pages, competitors
outputs: topic ids, keyword refs, prompt seeds, intent/persona/buying-stage
rules:
- 不编造 volume/CPC/rank。
- 关键词本体复用 OpenSEO。
- 同义表达优先映射同一 SearchTopic。
- GLOBAL 必须绑定具体 market profile，不用模糊“global”替代。
