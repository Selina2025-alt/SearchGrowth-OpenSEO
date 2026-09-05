/**
 * Search Growth MVP V1.0 — reference domain contracts.
 * DESIGN ARTIFACT: adapt to the actual OpenSEO Zod/Drizzle conventions after M0.
 */

export type SearchEngine = "GOOGLE" | "BAIDU" | "BING" | "OTHER";
export type DeviceType = "DESKTOP" | "MOBILE" | "TABLET";

export interface SearchMarketProfile {
  id: string;
  projectId: string;
  name: string;
  searchEngine: SearchEngine;
  locationCode?: number | string;
  locationName: string;
  countryCode?: string;
  languageCode: string;
  device: DeviceType;
  primary: boolean;
}

export interface SearchTopic {
  id: string;
  projectId: string;
  canonicalName: string;
  locale: string;
  description?: string;
  status: "ACTIVE" | "ARCHIVED" | "MERGED";
  mergedIntoTopicId?: string;
}

export type TrackedEntityType =
  | "BRAND"
  | "PRODUCT"
  | "COMPETITOR"
  | "COMPETITOR_PRODUCT";

export interface TrackedEntity {
  id: string;
  projectId: string;
  type: TrackedEntityType;
  canonicalName: string;
  canonicalDomain?: string;
  productUrl?: string;
  active: boolean;
}

export type AliasMatchMode =
  | "EXACT"
  | "CASE_INSENSITIVE_EXACT"
  | "WORD_BOUNDARY"
  | "UNICODE_SUBSTRING"
  | "DOMAIN";

export interface EntityAlias {
  id: string;
  entityId: string;
  text: string;
  locale?: string;
  matchMode: AliasMatchMode;
  caseSensitive: boolean;
}

export type PromptType =
  | "definition"
  | "problem"
  | "recommendation"
  | "comparison"
  | "alternative"
  | "risk"
  | "security"
  | "pricing"
  | "implementation"
  | "brand_validation"
  | "scenario";

export interface SearchPrompt {
  id: string;
  projectId: string;
  topicId: string;
  promptText: string;
  promptType: PromptType;
  persona?: string;
  buyingStage?: string;
  marketProfileId?: string;
  language: string;
  businessFit: number; // 0..100
  priority: number; // 0..100
  version: number;
  active: boolean;
}

export type ObservationSurfaceType =
  | "AGGREGATED_SEARCH_DATA"
  | "MODEL_API_SEARCH"
  | "CONSUMER_PRODUCT_OBSERVED"
  | "MANUAL_CONSUMER_OBSERVATION";

export type SurfaceFidelity =
  | "AGGREGATED"
  | "API_SIMULATION"
  | "CONSUMER_OBSERVED"
  | "MANUAL_OBSERVED";

export interface ObservationSurface {
  type: ObservationSurfaceType;
  name: string;
  fidelity: SurfaceFidelity;
  provider?: string;
  engine?: string;
  model?: string;
  modelVersion?: string;
  webSearch?: boolean;
  searchMode?: string;
  marketProfileId?: string;
  country?: string;
  language: string;
}

export interface GeoObservationRun {
  id: string;
  projectId: string;
  topicId: string;
  promptId: string;
  promptVersion: number;
  batchId: string;
  surface: ObservationSurface;
  repeatIndex: number;
  applicationCacheBypassed: boolean;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  rawAnswer: string;
  rawCitations: Array<{ url: string; title?: string; position?: number }>;
  rawResponseRef?: string;
  providerRequestId?: string;
  usage?: { inputTokens?: number; outputTokens?: number; cost?: number };
  observedAt: string;
}

export interface GeoObservationParse {
  id: string;
  runId: string;
  parserVersion: string;
  parserModel?: string;
  parseStatus: "SUCCESS" | "PARTIAL" | "FAILED";
  isCurrent: boolean;
  recommendation?: boolean;
  recommendationConfidence?: number;
  accuracyStatus?: "ACCURATE" | "PARTIAL" | "INACCURATE" | "UNKNOWN";
  createdAt: string;
}

export interface GeoEntityMention {
  id: string;
  parseId: string;
  entityId: string;
  mentioned: boolean;
  recommended?: boolean;
  mentionPosition?: number;
  evidenceText?: string;
}

export type CitationOwnership =
  | "OWNED_DOMAIN"
  | "CONTROLLED_PUBLICATION"
  | "EARNED_THIRD_PARTY"
  | "COMPETITOR"
  | "UNKNOWN";

export interface GeoCitation {
  id: string;
  runId: string;
  rawUrl: string;
  normalizedUrl: string;
  domain: string;
  title?: string;
  position?: number;
  ownership: CitationOwnership;
  matchedPublicationReceiptId?: string;
  sourceType?: string;
}

export type DataQualityStatus = "COMPLETE" | "DEGRADED" | "INSUFFICIENT";
export type DataQualityWarning =
  | "LOW_SAMPLE"
  | "NO_GA4"
  | "NO_GSC"
  | "PROVIDER_PARTIAL_FAILURE"
  | "MODEL_CHANGED"
  | "SURFACE_CHANGED"
  | "PARSER_CHANGED"
  | "MARKET_CHANGED"
  | "DATA_LAG";

export interface DataQuality {
  status: DataQualityStatus;
  warnings: DataQualityWarning[];
  successfulSamples?: number;
  attemptedSamples?: number;
}

export type OpportunityProfile =
  | "EXISTING_GOOGLE_PAGE"
  | "EXISTING_SEARCH_PAGE_PARTIAL"
  | "NEW_TOPIC"
  | "GEO_DISTRIBUTION"
  | "EVIDENCE_ONLY"
  | "TECHNICAL_BLOCKER";

export type PageFitAction =
  | "NEW_PAGE"
  | "REFRESH_PAGE"
  | "MERGE"
  | "DISTRIBUTE_ONLY"
  | "EVIDENCE_ONLY"
  | "TECHNICAL_FIX";

export interface SearchGrowthOpportunity {
  id: string;
  projectId: string;
  topicId: string;
  profile: OpportunityProfile;
  pageFitAction: PageFitAction;
  targetPageUrl?: string;
  scores: {
    businessFit: number;
    buyingIntent: number;
    seoSignal?: number;
    searchDemand?: number;
    rankGap?: number;
    geoGap?: number;
    citationSourceGap?: number;
    executionEase: number;
    finalScore?: number;
  };
  dataQuality: DataQuality;
  reason: string;
  recommendedAction: string;
  evidenceSnapshot: Record<string, unknown>;
  sourceSnapshotAt: string;
}

export type ClaimStatus = "APPROVED" | "UNVERIFIED" | "EXPIRED" | "REJECTED";
export type DataClassification = "PUBLIC_MARKETING" | "INTERNAL" | "RESTRICTED";

export interface Claim {
  id: string;
  projectId: string;
  claimText: string;
  status: ClaimStatus;
  evidenceType?: string;
  evidenceRef?: string;
  sourceUrl?: string;
  allowedMarkets: string[];
  allowedLanguages: string[];
  classification: DataClassification;
  lastVerifiedAt?: string;
  expiresAt?: string;
}

export interface SourceRef {
  id: string;
  projectId: string;
  kind: "URL" | "INTERNAL_EVIDENCE" | "CLAIM" | "PUBLICATION" | "OTHER";
  title?: string;
  url?: string;
  evidenceRef?: string;
  classification: DataClassification;
}

export type MediaRightsStatus =
  | "OWNED"
  | "LICENSED"
  | "APPROVED_EXTERNAL"
  | "UNKNOWN";

export interface MediaAsset {
  id: string;
  projectId: string;
  mediaType: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "OTHER";
  mimeType: string;
  bytes: number;
  sha256: string;
  storageKey: string;
  originalFilename: string;
  rightsStatus: MediaRightsStatus;
  classification: DataClassification;
  width?: number;
  height?: number;
  durationSeconds?: number;
  altText?: string;
}

export interface PublishedMediaRef {
  id: string;
  mediaAssetId: string;
  platform: string;
  accountId?: string;
  externalMediaId?: string;
  publicUrl?: string;
  sha256?: string;
  createdAt: string;
}

export interface WebPageSpec {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  canonicalPolicy: "SELF" | "EXPLICIT";
  canonicalUrl?: string;
  robots: "INDEX_FOLLOW" | "NOINDEX_FOLLOW" | "NOINDEX_NOFOLLOW";
  hreflang?: Array<{ locale: string; url: string }>;
  schemaJsonLd?: unknown[];
  internalLinkTargets?: Array<{ url: string; anchor: string }>;
  cta: { label: string; url: string; conversionGoal: string };
}

export interface ContentPackageVersion {
  id: string;
  contentPackageId: string;
  versionNo: number;
  brief: unknown;
  canonicalMarkdown: string;
  canonicalMetadata: Record<string, unknown>;
  webPageSpec?: WebPageSpec;
  claimIds: string[];
  sourceRefIds: string[];
  assetIds: string[];
  contentHash: string;
  gateStatus: "DRAFT" | "BLOCKED" | "PASSED";
  classification: DataClassification;
}

export interface ContentVariant {
  id: string;
  contentPackageVersionId: string;
  platform: string;
  format: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  assetRefs: string[];
  bodyHash: string;
  rendererVersion: string;
}

export type TargetIntent = "DRAFT" | "PUBLIC" | "SUBMIT_FOR_REVIEW" | "PAID_SUBMIT";

export type DistributionRoute =
  | "OWNED_SITE"
  | "WECHATSYNC_STAGED_FINALIZE"
  | "YXER_NATIVE"
  | "SOCIAL_AUTO_UPLOAD_NATIVE"
  | "POSTIZ_NATIVE"
  | "PAID_MEDIA_SERVICE";

export type FinalizerStrategy = "OFFICIAL_API" | "IN_PAGE_WEB_API" | "SERVICE_CLI" | "FIXED_DOM";

export interface ReleaseBundle {
  id: string;
  projectId: string;
  contentPackageVersionId: string;
  releaseVersion: number;
  status:
    | "DRAFT"
    | "DRY_RUN_READY"
    | "READY_FOR_APPROVAL"
    | "APPROVED"
    | "EXECUTING"
    | "PARTIAL"
    | "COMPLETED"
    | "PAUSED"
    | "CANCELLED";
  strategy: "WEBSITE_FIRST" | "PARALLEL" | "SOCIAL_ONLY";
  bundleHash: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface ReleaseTarget {
  id: string;
  releaseBundleId: string;
  contentVariantId: string;
  publisherConnectionId: string;
  platform: string;
  intent: TargetIntent;
  required: boolean;
  scheduledAt?: string;
  dependencyTargetId?: string;
  utmUrl?: string;
  targetHash: string;
}

export interface PublicationExecutionPlan {
  id: string;
  releaseTargetId: string;
  route: DistributionRoute;
  draftStagerId?: string;
  finalizerId?: string;
  finalizerStrategy?: FinalizerStrategy;
  executorVersion: string;
  requiredFields: string[];
  constraintsSnapshot: Record<string, unknown>;
  verificationPolicy: Record<string, unknown>;
  fallbackRoute?: DistributionRoute;
  planHash: string;
}

export interface PlatformDraft {
  id: string;
  releaseTargetId: string;
  platform: string;
  accountId: string;
  draftId: string;
  draftUrl?: string;
  contentHash: string;
  assetHashes: string[];
  stagerId: string;
  stagerVersion: string;
  verifiedAt?: string;
  createdAt: string;
}

export type PublishingJobStatus =
  | "PLANNED"
  | "PREFLIGHT"
  | "EXECUTION_READY"
  | "STAGING_DRAFT"
  | "DRAFT_CREATED"
  | "DRAFT_VERIFIED"
  | "FINALIZE_READY"
  | "FINALIZING"
  | "VALIDATING"
  | "DRY_RUN_PASSED"
  | "SUBMITTING"
  | "ACCEPTED_REMOTE_TASK"
  | "PUBLISH_SUBMITTED"
  | "PUBLIC_VERIFYING"
  | "PUBLIC_VERIFIED"
  | "AUTH_REQUIRED"
  | "PUBLISH_FIELDS_REQUIRED"
  | "RATE_LIMITED"
  | "REMOTE_STATE_UNKNOWN"
  | "REJECTED"
  | "EXECUTION_FAILED"
  | "VERIFY_FAILED"
  | "CANCELLED";

export interface PublicationReceipt {
  id: string;
  jobId: string;
  releaseTargetId: string;
  platform: string;
  executorId: string;
  executorVersion: string;
  externalDraftId?: string;
  externalTaskId?: string;
  externalContentId?: string;
  publicUrl?: string;
  contentHash: string;
  mediaHashes: string[];
  status: PublishingJobStatus;
  submittedAt?: string;
  publishedAt?: string;
  verifiedAt?: string;
  verification: Record<string, unknown>;
}

export interface PublisherConstraints {
  titleMaxChars?: number;
  bodyMaxChars?: number;
  maxImages?: number;
  maxVideoBytes?: number;
  allowedMimeTypes?: string[];
  maxTags?: number;
  supportsExternalLinks?: boolean;
  scheduleMinDelaySeconds?: number;
  scheduleMaxDays?: number;
  imageAspectRatios?: string[];
}

export interface PublisherCertification {
  id: string;
  platform: string;
  executorId: string;
  executorVersion: string;
  status:
    | "UNVERIFIED"
    | "DRAFT_SMOKE_PASSED"
    | "FINALIZE_SMOKE_PASSED"
    | "PUBLIC_VERIFY_PASSED"
    | "CERTIFIED"
    | "SUSPENDED";
  constraints: PublisherConstraints;
  certifiedAt?: string;
  recheckAfter?: string;
}

export interface AuditEvent {
  id: string;
  projectId: string;
  actorId: string;
  action: string;
  objectType: string;
  objectId: string;
  beforeRef?: string;
  afterRef?: string;
  metadata: Record<string, unknown>;
  correlationId: string;
  createdAt: string;
}

export interface RuntimeControl {
  key: string;
  value: boolean | number | string;
  reason?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface ExperimentSnapshot {
  id: string;
  experimentId: string;
  type: "BASELINE" | "D7" | "D14" | "D30" | "MANUAL";
  capturedAt: string;
  windowStart?: string;
  windowEnd?: string;
  timezone?: string;
  seoMetrics: Record<string, unknown>;
  geoMetrics: Record<string, unknown>;
  ga4Metrics: Record<string, unknown>;
  publicationMetrics: Record<string, unknown>;
  indexingMetrics: Record<string, unknown>;
  dataQuality: DataQuality;
}
