# Skill: Search Growth Opportunity

version: 1.0
purpose: 选择下一项最值得做的 Search Growth Action。
tools: existing OpenSEO SearchOpportunityService, GEO metrics, PageFitService
profiles: EXISTING_GOOGLE_PAGE, EXISTING_SEARCH_PAGE_PARTIAL, NEW_TOPIC, GEO_DISTRIBUTION, EVIDENCE_ONLY, TECHNICAL_BLOCKER
rules:

- final score deterministic。
- LLM只能解释。
- Existing OpenSEO SEO opportunity是输入。
- NEW_PAGE前强制PageFit。
