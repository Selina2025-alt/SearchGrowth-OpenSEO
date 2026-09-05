-- Search Growth V1.0 REFERENCE ONLY.
-- Implement with OpenSEO's actual Drizzle SQLite + PostgreSQL schema conventions.
-- Do not execute this file directly in production.

CREATE TABLE search_growth_targets (
  project_id TEXT PRIMARY KEY NOT NULL,
  config_json TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE search_market_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  search_engine TEXT NOT NULL,
  location_code TEXT,
  location_name TEXT NOT NULL,
  country_code TEXT,
  language_code TEXT NOT NULL,
  device TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE search_topics (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  locale TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  merged_into_topic_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_search_topics_unique
ON search_topics(project_id, canonical_name, locale);

CREATE TABLE search_topic_keyword_refs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  open_seo_keyword_ref TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_topic_keyword_ref_unique
ON search_topic_keyword_refs(topic_id, open_seo_keyword_ref);

CREATE TABLE tracked_entities (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  canonical_domain TEXT,
  product_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE entity_aliases (
  id TEXT PRIMARY KEY NOT NULL,
  entity_id TEXT NOT NULL,
  alias_text TEXT NOT NULL,
  locale TEXT,
  match_mode TEXT NOT NULL,
  case_sensitive INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE search_prompts (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  normalized_prompt TEXT NOT NULL,
  prompt_type TEXT NOT NULL,
  persona TEXT,
  buying_stage TEXT,
  market_profile_id TEXT,
  language TEXT NOT NULL,
  business_fit REAL NOT NULL,
  priority REAL NOT NULL,
  source TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_search_prompts_unique
ON search_prompts(project_id, normalized_prompt, market_profile_id, version);

CREATE TABLE geo_observation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  batch_id TEXT NOT NULL,
  surface_type TEXT NOT NULL,
  surface_name TEXT NOT NULL,
  surface_fidelity TEXT NOT NULL,
  provider TEXT,
  engine TEXT,
  model TEXT,
  model_version TEXT,
  web_search INTEGER,
  search_mode TEXT,
  market_profile_id TEXT,
  country TEXT,
  language TEXT NOT NULL,
  repeat_index INTEGER NOT NULL,
  application_cache_bypassed INTEGER NOT NULL,
  status TEXT NOT NULL,
  raw_answer TEXT,
  raw_citations_json TEXT NOT NULL,
  raw_response_ref TEXT,
  provider_request_id TEXT,
  usage_json TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE geo_observation_parses (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  parser_model TEXT,
  parse_status TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  recommendation INTEGER,
  recommendation_confidence REAL,
  accuracy_status TEXT,
  parsed_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_geo_parse_version
ON geo_observation_parses(run_id, parser_version);

CREATE TABLE geo_entity_mentions (
  id TEXT PRIMARY KEY NOT NULL,
  parse_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  mentioned INTEGER NOT NULL,
  recommended INTEGER,
  mention_position INTEGER,
  evidence_text TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE geo_citations (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  raw_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT,
  citation_position INTEGER,
  ownership TEXT NOT NULL,
  matched_publication_receipt_id TEXT,
  source_type TEXT,
  safe_url_status TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_geo_citation_run_url
ON geo_citations(run_id, normalized_url);

CREATE TABLE growth_opportunities (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  profile TEXT NOT NULL,
  status TEXT NOT NULL,
  page_fit_action TEXT NOT NULL,
  target_page_url TEXT,
  score_json TEXT NOT NULL,
  final_score REAL,
  data_quality_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  evidence_snapshot_json TEXT NOT NULL,
  source_snapshot_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE source_refs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  title TEXT,
  url TEXT,
  evidence_ref TEXT,
  classification TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE claims (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  normalized_claim TEXT NOT NULL,
  status TEXT NOT NULL,
  evidence_type TEXT,
  evidence_ref TEXT,
  source_url TEXT,
  allowed_markets_json TEXT NOT NULL,
  allowed_languages_json TEXT NOT NULL,
  classification TEXT NOT NULL,
  verified_by TEXT,
  last_verified_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  rights_status TEXT NOT NULL,
  classification TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_seconds REAL,
  alt_text TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE published_media_refs (
  id TEXT PRIMARY KEY NOT NULL,
  media_asset_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_id TEXT,
  external_media_id TEXT,
  public_url TEXT,
  sha256 TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE content_packages (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  opportunity_id TEXT,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  locale TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE content_package_versions (
  id TEXT PRIMARY KEY NOT NULL,
  content_package_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  brief_json TEXT NOT NULL,
  canonical_markdown TEXT NOT NULL,
  canonical_metadata_json TEXT NOT NULL,
  web_page_spec_json TEXT,
  claim_ids_json TEXT NOT NULL,
  source_ref_ids_json TEXT NOT NULL,
  asset_ids_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  gate_status TEXT NOT NULL,
  gate_report_json TEXT,
  classification TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_content_version
ON content_package_versions(content_package_id, version_no);

CREATE TABLE content_variants (
  id TEXT PRIMARY KEY NOT NULL,
  content_package_version_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  format TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  asset_refs_json TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  renderer_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE release_bundles (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  content_package_version_id TEXT NOT NULL,
  release_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  release_strategy TEXT NOT NULL,
  utm_policy_json TEXT NOT NULL,
  bundle_hash TEXT NOT NULL,
  dry_run_report_json TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE publisher_connections (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  executor_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  credential_profile_name TEXT,
  external_account_id TEXT,
  local_bridge_id TEXT,
  capabilities_json TEXT NOT NULL,
  constraints_json TEXT NOT NULL,
  status TEXT NOT NULL,
  last_health_check_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE publisher_certifications (
  id TEXT PRIMARY KEY NOT NULL,
  publisher_connection_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  content_type TEXT NOT NULL,
  executor_id TEXT NOT NULL,
  executor_version TEXT NOT NULL,
  status TEXT NOT NULL,
  constraints_snapshot_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  certified_by TEXT,
  certified_at TEXT,
  recheck_after TEXT,
  suspended_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE release_targets (
  id TEXT PRIMARY KEY NOT NULL,
  release_bundle_id TEXT NOT NULL,
  content_variant_id TEXT NOT NULL,
  publisher_connection_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  target_intent TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  scheduled_at TEXT,
  dependency_target_id TEXT,
  utm_url TEXT,
  target_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE publication_execution_plans (
  id TEXT PRIMARY KEY NOT NULL,
  release_target_id TEXT NOT NULL UNIQUE,
  route TEXT NOT NULL,
  draft_stager_id TEXT,
  finalizer_id TEXT,
  finalizer_strategy TEXT,
  executor_version TEXT NOT NULL,
  required_fields_json TEXT NOT NULL,
  constraints_snapshot_json TEXT NOT NULL,
  verification_policy_json TEXT NOT NULL,
  fallback_route TEXT,
  plan_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE platform_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  release_target_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  draft_url TEXT,
  content_hash TEXT NOT NULL,
  asset_hashes_json TEXT NOT NULL,
  stager_id TEXT NOT NULL,
  stager_version TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_platform_draft
ON platform_drafts(platform, account_id, draft_id);

CREATE TABLE local_bridges (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  protocol_version INTEGER NOT NULL,
  bridge_version TEXT NOT NULL,
  status TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  allowed_executor_ids_json TEXT NOT NULL,
  executor_versions_json TEXT NOT NULL,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE publishing_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  release_target_id TEXT NOT NULL,
  execution_plan_id TEXT NOT NULL,
  executor_id TEXT NOT NULL,
  executor_version TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  leased_by TEXT,
  lease_expires_at TEXT,
  external_draft_id TEXT,
  external_task_id TEXT,
  external_content_id TEXT,
  public_url TEXT,
  last_error_code TEXT,
  last_error_message_safe TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE publication_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  publishing_job_id TEXT NOT NULL UNIQUE,
  release_target_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  executor_id TEXT NOT NULL,
  executor_version TEXT NOT NULL,
  external_draft_id TEXT,
  external_task_id TEXT,
  external_content_id TEXT,
  public_url TEXT,
  content_hash TEXT NOT NULL,
  media_hashes_json TEXT NOT NULL,
  status TEXT NOT NULL,
  submitted_at TEXT,
  published_at TEXT,
  verified_at TEXT,
  verification_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE indexing_observations (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  publication_receipt_id TEXT,
  url TEXT NOT NULL,
  search_engine TEXT NOT NULL,
  market_profile_id TEXT,
  observation_type TEXT NOT NULL,
  status TEXT NOT NULL,
  details_json TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE TABLE experiments (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  opportunity_id TEXT,
  release_bundle_id TEXT,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  status TEXT NOT NULL,
  activation_policy TEXT NOT NULL,
  activation_at TEXT,
  target_keyword_refs_json TEXT NOT NULL,
  target_prompt_refs_json TEXT NOT NULL,
  target_surface_refs_json TEXT NOT NULL,
  recheck_policy_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE experiment_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  experiment_id TEXT NOT NULL,
  snapshot_type TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  window_start TEXT,
  window_end TEXT,
  timezone TEXT,
  seo_metrics_json TEXT NOT NULL,
  geo_metrics_json TEXT NOT NULL,
  ga4_metrics_json TEXT NOT NULL,
  publication_metrics_json TEXT NOT NULL,
  indexing_metrics_json TEXT NOT NULL,
  data_quality_json TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE search_growth_audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  before_ref TEXT,
  after_ref TEXT,
  metadata_json TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE runtime_controls (
  control_key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  reason TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
