# Domain Data Model V1.0

## 1. SearchGrowthTarget

业务目标的结构化层；OpenSEO Project Context 继续承载叙事定位。

```text
project_id
products[]
icps[]
personas[]
conversion_goals[]
preferred_market_profile_ids[]
```

## 2. SearchMarketProfile

```text
id
project_id
name
search_engine      GOOGLE | BAIDU | BING | OTHER
location_code
location_name
language_code
device             DESKTOP | MOBILE
country
primary
active
```

任何 Rank/Keyword/Observation 都必须显式绑定市场口径，不用 `GLOBAL` 猜。

## 3. SearchTopic

```text
id
project_id
canonical_name
locale
description
status
```

关系：
```text
Topic
 ├─ existing OpenSEO keyword refs
 ├─ prompts
 ├─ pages
 ├─ opportunities
 ├─ content packages
 └─ experiments
```

## 4. TrackedEntity

```text
id
project_id
type    BRAND | PRODUCT | COMPETITOR | COMPETITOR_PRODUCT
canonical_name
owning_entity_id?
active
```

### EntityAlias
```text
entity_id
text
locale
match_mode   EXACT | CASE_INSENSITIVE_EXACT | WORD_BOUNDARY | UNICODE_SUBSTRING | DOMAIN
case_sensitive
priority
```

禁止把过短通用词直接设 substring alias。

## 5. SearchPrompt

```text
id
project_id
topic_id
prompt_text
normalized_prompt
prompt_type
persona
buying_stage
market_profile_id
language
business_fit
priority
version
active
```

Prompt version 不覆盖历史。

## 6. GeoObservationRun — Immutable

只存“发生了什么”：

```text
id
batch_id
project_id
prompt_id
prompt_version
surface_type
surface_name
fidelity
provider
engine
model
model_version
web_search
search_mode
market_profile_id
repeat_index
application_cache_bypassed
raw_answer
raw_response
provider_request_id
usage/cost
started_at
finished_at
status
```

## 7. GeoObservationParse

```text
id
run_id
parser_version
parse_status
accuracy_status
parsed_at
is_current
```

### GeoEntityMention
```text
parse_id
entity_id
mentioned
recommended
mention_position
sentiment?
evidence_span_ref?
```

### GeoCitation
```text
run_id / parse_id
raw_url
normalized_url
domain
title
position
source_ownership
matched_publication_receipt_id?
```

`source_ownership`：
- OWNED_DOMAIN
- CONTROLLED_PUBLICATION
- EARNED_THIRD_PARTY
- COMPETITOR
- UNKNOWN

## 8. SearchGrowthOpportunity

```text
id
project_id
topic_id
market_profile_id
type
page_fit_action
target_page_url?
score
score_profile
data_quality_status
warnings[]
component_scores_json
evidence_snapshot_json
reason
recommended_action
```

## 9. Claim / SourceRef

Claim：
```text
claim_text
status APPROVED|UNVERIFIED|EXPIRED|REJECTED
source_refs[]
allowed_markets[]
allowed_languages[]
verified_by
last_verified_at
expires_at
classification
```

SourceRef：
```text
type URL|INTERNAL_DOC|PRODUCT_FACT|RESEARCH
ref
captured_at
```

## 10. Content

### ContentPackage
主题容器。

### ContentVersion — Immutable
```text
version_no
canonical_markdown
web_page_spec_json
metadata_json
claim_ids[]
source_refs[]
asset_ids[]
content_hash
gate_status
```

### ContentVariant
平台原生版，不是全文简单复制。

## 11. Media

### MediaAsset
R2 源资产：
```text
sha256
mime
size
rights_status OWNED|LICENSED|APPROVED_EXTERNAL|UNKNOWN
classification
```

### PublishedMediaRef
```text
asset_id
platform
account_id
external_media_id?
public_url?
sha256
created_at
```

## 12. Release / Distribution

### ReleaseBundle — Immutable approval unit
### ReleaseTarget
### PublicationExecutionPlan
### PlatformDraft
### PublishingJob
### PublicationReceipt

## 13. Governance

### AuditEvent — append only
### RuntimeControl
### PublisherCertification

## 14. Experiment

### Experiment
### ExperimentSnapshot

所有 snapshot 必须保存：
- window start/end；
- timezone；
- model/surface versions；
- data quality warnings。
