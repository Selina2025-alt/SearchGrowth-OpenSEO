import type { InferSelectModel } from "drizzle-orm";
import { z } from "zod";
import type { experiments } from "@/db/search-growth.schema";

// ---------------------------------------------------------------------------
// Experiment domain boundary
// ---------------------------------------------------------------------------
//
// ONE Experiment is the credential-free, Project-scoped container that binds a
// required Topic (and optionally the Opportunity and ReleaseBundle that motivated
// it) to a written hypothesis plus the opaque reference/policy documents a later
// measurement slice reads (05_DOMAIN_DATA_MODEL.md §14 Experiment;
// 16_ATTRIBUTION_EXPERIMENT_SPEC.md §§4–5; 21_TEST_ACCEPTANCE_PLAN.md §27). This
// is the persistence/contract core slice ONLY: it does not activate an
// experiment, schedule a workflow, create snapshots, publish, call a provider,
// use credentials, spend or run any production behavior (TASK GOAL).
//
// The Drizzle columns already give compile-time narrowing; `experimentSchema` is
// the matching runtime/domain representation of the direct fields (TASK item 1)
// for untrusted input before any later repository write:
//   - `id` and `projectId` are the stable identity and the explicit Project
//     ownership keys. There is no implicit/global ownership.
//   - `topicId` is the REQUIRED Topic relation; `opportunityId` and
//     `releaseBundleId` are nullable (NULL = no such relation attached). The
//     storage composite FKs keep every non-null value same-Project (TASK item 2).
//     Optional relations are `.nullable()`, not `.optional()`, at this row
//     boundary.
//   - `title` and `hypothesis` are required strings carried verbatim.
//   - `status` is a required opaque string: no V1.0 document defines an
//     authoritative Experiment status/lifecycle union, so no enum, taxonomy or
//     lifecycle transition is invented (TASK item 3).
//   - `activationPolicy` is the ONE authoritative enum: the source-defined
//     Distribution Experiment activation policy (FIRST_REQUIRED_PUBLIC |
//     ALL_REQUIRED_TERMINAL — 16_ATTRIBUTION_EXPERIMENT_SPEC.md §4). It is also
//     DB-enforced by the named `experiments_activation_policy_valid` CHECK.
//     No default is applied here: the documented default FIRST_REQUIRED_PUBLIC
//     is a resolution rule for later work, not an activation performed by this
//     boundary.
//   - `targetKeywordRefsJson`, `targetPromptRefsJson`, `targetSurfaceRefsJson`
//     and `recheckPolicyJson` are required JSON documents persisted as JSON text
//     (the accepted JSON-column convention). Their validity is enforced at the
//     database boundary by the named `experiments_*_valid` CHECKs on both
//     dialects, so the migration-backed storage test — not this boundary — proves
//     JSON validity (TASK item 1/3). The boundary carries each document verbatim
//     and never decomposes it into relational ids.
//   - `activationAt` is nullable (NULL = not activated); `createdAt` is the
//     append-only system insert timestamp. There is no `updatedAt` and no
//     snapshot/activation/execution field (TASK item 1 / OUT OF SCOPE).
//
// The exported `Experiment` row type is the domain shape later activation and
// measurement tasks will consume. The legacy reference `experiment_snapshots`
// table is deliberately NOT represented here (TASK OUT OF SCOPE).

export type Experiment = InferSelectModel<typeof experiments>;

const activationPolicySchema = z.enum([
  "FIRST_REQUIRED_PUBLIC",
  "ALL_REQUIRED_TERMINAL",
]);

export const experimentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  topicId: z.string(),
  opportunityId: z.string().nullable(),
  releaseBundleId: z.string().nullable(),
  title: z.string(),
  hypothesis: z.string(),
  status: z.string(),
  activationPolicy: activationPolicySchema,
  activationAt: z.string().nullable(),
  targetKeywordRefsJson: z.string(),
  targetPromptRefsJson: z.string(),
  targetSurfaceRefsJson: z.string(),
  recheckPolicyJson: z.string(),
  createdAt: z.string(),
});
