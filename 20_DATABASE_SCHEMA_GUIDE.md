# Database Schema Guide V1.0

实现时使用 OpenSEO Drizzle + D1/Postgres 双 schema 模式；`schemas/migrations-reference.sql` 仅作设计参考。

## 1. 新增核心表

### Search/Demand

- search_growth_targets
- search_market_profiles
- search_topics
- search_topic_keyword_refs
- tracked_entities
- entity_aliases
- search_prompts

### GEO

- geo_observation_runs
- geo_observation_parses
- geo_entity_mentions
- geo_citations

### Opportunity

- growth_opportunities

### Evidence/Content

- source_refs
- claims
- content_packages
- content_package_versions
- content_variants

### Media

- media_assets
- published_media_refs

### Release/Distribution

- release_bundles
- release_targets
- publication_execution_plans
- platform_drafts
- publisher_connections
- publisher_certifications
- local_bridges
- publishing_jobs
- publication_receipts

### Search/Experiment

- indexing_observations
- experiments
- experiment_snapshots

### Governance

- search_growth_audit_events
- runtime_controls

## 2. 不复制的表

不创建第二套：

- projects；
- competitors；
- key pages；
- keywords/rank；
- GSC；
- GA4。

## 3. Immutable Tables

默认 append-only/immutable：

- geo_observation_runs；
- geo_observation_parses（记录不改，current pointer逻辑另处理）；
- content_package_versions；
- release approved versions；
- publication_receipts；
- audit events；
- experiment snapshots。

## 4. Uniqueness

关键：

- normalized prompt per project/market/version policy；
- citation per run+normalized URL；
- content version no；
- job idempotency key；
- receipt per job；
- publication execution plan per target/version。

## 5. URL

同时保存 raw URL 与 normalized identity key。

## 6. JSON

早期 D1 可用 JSON text 存低频可变 schema，但核心 searchable fields 独立列；Postgres 对应 jsonb 时保持语义一致。
