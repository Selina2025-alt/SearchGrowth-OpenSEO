import { readFileSync } from "node:fs";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { entityAliases, trackedEntities } from "@/db/schema";
import type { AliasMatchMode } from "@/types/schemas/entity-alias";
import type { GeoExactEntityMentionCandidate } from "../services/geoExactEntityMentionMatcher";
import { GeoExactEntityMentionCandidateReaderError } from "../services/geoExactEntityMentionCandidateReader";
import type * as CandidateReaderRepositoryModule from "./GeoExactEntityMentionCandidateReaderRepository";

// The candidate reader adapter is exercised against the real accepted storage
// contract: an in-memory SQLite database built from the actual forward migration
// DDL for `tracked_entities` and `entity_aliases` (T103, 0048), including the
// same-Project composite FK and the Project cascade, with foreign keys enabled.
// `@/db` is replaced with that handle so the production adapter code path (two
// SELECTs, no write of any kind) runs unmodified.
//
// Invariants under test (T145, T144, ADR-004, 05_DOMAIN_DATA_MODEL.md §§4 and 7,
// 07_GEO_MEASUREMENT_SPEC.md §5):
//   - Project isolation: another Project's entities and aliases never appear;
//   - one canonical-name candidate per ACTIVE entity, verbatim;
//   - one alias candidate only for an eligible alias: owning entity active,
//     same Project, `matchMode` exactly `EXACT`, persisted `caseSensitive` true;
//   - deterministic order (canonicals, then aliases by entity id then row id)
//     that gives no alias priority and collapses no collision;
//   - same-surface collisions stay separate candidates;
//   - an invalid `projectId` rejects before any SELECT;
//   - an ELIGIBLE row with an empty stored id or surface text fails explicitly
//     and names the row, instead of being silently filtered out;
//   - the reader mutates nothing.

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));

const DRIZZLE_STATEMENT_SEPARATOR = "--> statement-breakpoint";

let client: Client;
let testDb: ReturnType<typeof drizzle>;
let reader: typeof CandidateReaderRepositoryModule.GeoExactEntityMentionCandidateReaderRepository;

// The only migration that creates (or rebuilds) both accepted tables.
const ENTITY_ALIAS_DDL = readFileSync(
  "drizzle/0048_ordinary_legion.sql",
  "utf8",
);

const statementParts = (ddl: string) =>
  ddl
    .split(DRIZZLE_STATEMENT_SEPARATOR)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  testDb = drizzle(client);
  vi.doMock("@/db", () => ({ db: testDb }));

  await client.execute("PRAGMA foreign_keys = ON");
  await client.executeMultiple(
    [
      `CREATE TABLE projects (id text PRIMARY KEY);`,
      `INSERT INTO projects (id) VALUES ('proj_alpha'), ('proj_beta');`,
      ...statementParts(ENTITY_ALIAS_DDL),
    ].join("\n"),
  );

  ({ GeoExactEntityMentionCandidateReaderRepository: reader } =
    await import("./GeoExactEntityMentionCandidateReaderRepository"));
});

afterAll(() => {
  client.close();
});

beforeEach(async () => {
  // Child-first teardown: aliases reference tracked entities.
  await testDb.delete(entityAliases);
  await testDb.delete(trackedEntities);
});

async function seedEntity(
  id: string,
  projectId: string,
  options: { canonicalName?: string; active?: boolean } = {},
) {
  await testDb.insert(trackedEntities).values({
    id,
    projectId,
    entityType: "BRAND",
    canonicalName: options.canonicalName ?? `Entity ${id}`,
    active: options.active ?? true,
  });
}

async function seedAlias(
  id: string,
  projectId: string,
  entityId: string,
  options: {
    aliasText?: string;
    matchMode?: AliasMatchMode;
    caseSensitive?: boolean;
    priority?: number;
  } = {},
) {
  await testDb.insert(entityAliases).values({
    id,
    projectId,
    entityId,
    aliasText: options.aliasText ?? `Alias ${id}`,
    matchMode: options.matchMode ?? "EXACT",
    caseSensitive: options.caseSensitive ?? true,
    priority: options.priority ?? 0,
  });
}

function canonical(
  entityId: string,
  surface: string,
  projectId = "proj_alpha",
): GeoExactEntityMentionCandidate {
  return { projectId, entityId, surface, source: { kind: "CANONICAL_NAME" } };
}

function alias(
  entityId: string,
  aliasId: string,
  surface: string,
  projectId = "proj_alpha",
): GeoExactEntityMentionCandidate {
  return {
    projectId,
    entityId,
    surface,
    source: { kind: "ALIAS", aliasId },
  };
}

/** Run the reader and return the rejection it must have raised. */
async function captureReaderError(
  run: () => Promise<unknown>,
): Promise<GeoExactEntityMentionCandidateReaderError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof GeoExactEntityMentionCandidateReaderError)
      return error;
    throw error;
  }
  throw new Error("expected the reader to reject, but it resolved");
}

describe("GeoExactEntityMentionCandidateReaderRepository reads", () => {
  it("maps an active entity's canonical name verbatim", async () => {
    await seedEntity("ent_alpha", "proj_alpha", { canonicalName: "Acme Inc." });

    const candidates: GeoExactEntityMentionCandidate[] =
      await reader.listCandidates("proj_alpha");

    // Project id, stable entity id, literal text, and source identity all come
    // from the accepted row unchanged.
    expect(candidates).toEqual([
      {
        projectId: "proj_alpha",
        entityId: "ent_alpha",
        surface: "Acme Inc.",
        source: { kind: "CANONICAL_NAME" },
      },
    ]);
  });

  it("maps an eligible alias with its own row id as source identity", async () => {
    await seedEntity("ent_alpha", "proj_alpha", { canonicalName: "Acme" });
    await seedAlias("alias_1", "proj_alpha", "ent_alpha", {
      aliasText: "Acme Inc",
    });

    expect(await reader.listCandidates("proj_alpha")).toEqual([
      canonical("ent_alpha", "Acme"),
      alias("ent_alpha", "alias_1", "Acme Inc"),
    ]);
  });

  it("returns no candidate for a Project with no stored entities", async () => {
    await seedEntity("ent_beta", "proj_beta", { canonicalName: "Beta" });
    await seedAlias("alias_beta", "proj_beta", "ent_beta", {
      aliasText: "Beta",
    });

    expect(await reader.listCandidates("proj_alpha")).toEqual([]);
  });

  it("excludes another Project's entities and aliases", async () => {
    await seedEntity("ent_alpha", "proj_alpha", { canonicalName: "Alpha" });
    await seedAlias("alias_alpha", "proj_alpha", "ent_alpha", {
      aliasText: "Alpha Co",
    });
    await seedEntity("ent_beta", "proj_beta", { canonicalName: "Beta" });
    await seedAlias("alias_beta", "proj_beta", "ent_beta", {
      aliasText: "Beta Co",
    });

    expect(await reader.listCandidates("proj_alpha")).toEqual([
      canonical("ent_alpha", "Alpha"),
      alias("ent_alpha", "alias_alpha", "Alpha Co"),
    ]);
  });

  it("excludes an inactive entity's canonical name and its aliases", async () => {
    await seedEntity("ent_live", "proj_alpha", { canonicalName: "Live" });
    await seedEntity("ent_retired", "proj_alpha", {
      canonicalName: "Retired",
      active: false,
    });
    await seedAlias("alias_live", "proj_alpha", "ent_live", {
      aliasText: "Live Co",
    });
    await seedAlias("alias_retired", "proj_alpha", "ent_retired", {
      aliasText: "Retired Co",
    });

    // `active` is the accepted soft-disable flag: a disabled entity's surfaces
    // are not eligible, even though its rows are still stored and referenced.
    expect(await reader.listCandidates("proj_alpha")).toEqual([
      canonical("ent_live", "Live"),
      alias("ent_live", "alias_live", "Live Co"),
    ]);
  });

  it.each([
    ["CASE_INSENSITIVE_EXACT", true],
    ["WORD_BOUNDARY", true],
    ["UNICODE_SUBSTRING", true],
    ["DOMAIN", true],
    // An EXACT alias explicitly persisted as case-insensitive is not literal
    // case-sensitive material either.
    ["EXACT", false],
  ] as const)(
    "excludes a %s alias (caseSensitive %s) from the literal candidate list",
    async (matchMode, caseSensitive) => {
      await seedEntity("ent_alpha", "proj_alpha", { canonicalName: "Acme" });
      await seedAlias("alias_excluded", "proj_alpha", "ent_alpha", {
        aliasText: "Acme Alias",
        matchMode,
        caseSensitive,
      });

      // Feeding any of these to the case-sensitive literal matcher would
      // silently approximate a different §4 match mode.
      expect(await reader.listCandidates("proj_alpha")).toEqual([
        canonical("ent_alpha", "Acme"),
      ]);
    },
  );

  it("orders candidates deterministically without consulting alias priority", async () => {
    // Inserted out of order so insertion order cannot be mistaken for the
    // result order, and with priorities that contradict it.
    await seedEntity("ent_c", "proj_alpha", { canonicalName: "C" });
    await seedEntity("ent_a", "proj_alpha", { canonicalName: "A" });
    await seedEntity("ent_b", "proj_alpha", { canonicalName: "B" });
    await seedAlias("alias_z", "proj_alpha", "ent_b", {
      aliasText: "B zed",
      priority: 100,
    });
    await seedAlias("alias_m", "proj_alpha", "ent_a", {
      aliasText: "A em",
      priority: 50,
    });
    await seedAlias("alias_a", "proj_alpha", "ent_a", {
      aliasText: "A ay",
      priority: 0,
    });

    const ordered = [
      canonical("ent_a", "A"),
      canonical("ent_b", "B"),
      canonical("ent_c", "C"),
      alias("ent_a", "alias_a", "A ay"),
      alias("ent_a", "alias_m", "A em"),
      alias("ent_b", "alias_z", "B zed"),
    ];

    // Canonicals first, then aliases by stable entity id then row id — the
    // highest-priority alias sorts last, proving priority orders nothing here.
    expect(await reader.listCandidates("proj_alpha")).toEqual(ordered);
    expect(await reader.listCandidates("proj_alpha")).toEqual(ordered);
  });

  it("keeps colliding surfaces as separate candidates", async () => {
    await seedEntity("ent_alpha", "proj_alpha", { canonicalName: "Acme" });
    await seedEntity("ent_beta", "proj_alpha", { canonicalName: "Acme" });
    await seedAlias("alias_alpha", "proj_alpha", "ent_alpha", {
      aliasText: "Acme",
    });

    const candidates = await reader.listCandidates("proj_alpha");

    // Three candidates, one literal: no dedupe, no ownership inference, and no
    // winner is chosen for the collision.
    expect(candidates).toHaveLength(3);
    expect(candidates.map((candidate) => candidate.surface)).toEqual([
      "Acme",
      "Acme",
      "Acme",
    ]);
    expect(candidates).toEqual([
      canonical("ent_alpha", "Acme"),
      canonical("ent_beta", "Acme"),
      alias("ent_alpha", "alias_alpha", "Acme"),
    ]);
  });

  it("reads the same rows twice without modifying any entity or alias row", async () => {
    await seedEntity("ent_alpha", "proj_alpha", { canonicalName: "Acme" });
    await seedEntity("ent_idle", "proj_alpha", {
      canonicalName: "Idle",
      active: false,
    });
    await seedAlias("alias_exact", "proj_alpha", "ent_alpha");
    await seedAlias("alias_domain", "proj_alpha", "ent_alpha", {
      matchMode: "DOMAIN",
    });

    const entitiesBefore = await testDb
      .select()
      .from(trackedEntities)
      .orderBy(trackedEntities.id);
    const aliasesBefore = await testDb
      .select()
      .from(entityAliases)
      .orderBy(entityAliases.id);

    await reader.listCandidates("proj_alpha");

    expect(
      await testDb.select().from(trackedEntities).orderBy(trackedEntities.id),
    ).toEqual(entitiesBefore);
    expect(
      await testDb.select().from(entityAliases).orderBy(entityAliases.id),
    ).toEqual(aliasesBefore);
  });
});

describe("GeoExactEntityMentionCandidateReaderRepository projectId validation", () => {
  it.each([
    ["a number", 42],
    ["null", null],
    ["an absent value", undefined],
    ["an object", {}],
  ])("rejects %s as projectId", async (_label, value) => {
    await seedEntity("ent_alpha", "proj_alpha", { canonicalName: "Acme" });

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an untrusted boundary is exactly what the adapter must reject at runtime
    const untrustedProjectId = value as unknown as string;
    const error = await captureReaderError(() =>
      reader.listCandidates(untrustedProjectId),
    );

    expect(error.name).toBe("GeoExactEntityMentionCandidateReaderError");
    expect(error.field).toBe("projectId");
    expect(error.row).toBeNull();
    expect(error.message).toMatch(/projectId/);
  });

  it("rejects an empty projectId before reading any stored row", async () => {
    // A decoy under the empty-Project key: an active entity whose canonical
    // name is itself unusable. If the empty id reached the SELECT it would
    // return this row and be reported as a canonical_name failure, so the
    // projectId failure is the proof that no query ran.
    await client.execute("INSERT OR IGNORE INTO projects (id) VALUES ('')");
    await seedEntity("ent_empty_project", "", { canonicalName: "" });

    const error = await captureReaderError(() => reader.listCandidates(""));

    expect(error.field).toBe("projectId");
    expect(error.message).toBe(
      "GEO exact entity mention candidate reader: projectId must be a non-empty string.",
    );
  });
});

describe("GeoExactEntityMentionCandidateReaderRepository unusable stored values", () => {
  it("fails explicitly on an eligible entity's empty canonical name", async () => {
    // A healthy sibling proves the reader does not fall back to a shorter list.
    await seedEntity("ent_healthy", "proj_alpha", { canonicalName: "Acme" });
    await seedEntity("ent_broken", "proj_alpha", { canonicalName: "" });

    const error = await captureReaderError(() =>
      reader.listCandidates("proj_alpha"),
    );

    expect(error.field).toBe("tracked_entities[ent_broken].canonical_name");
    expect(error.row).toEqual({
      table: "tracked_entities",
      entityId: "ent_broken",
      rowId: "ent_broken",
    });
    expect(error.message).toContain("ent_broken");
    expect(error.message).toContain("canonical_name");
  });

  it("fails explicitly on an eligible alias's empty text", async () => {
    await seedEntity("ent_alpha", "proj_alpha", { canonicalName: "Acme" });
    await seedAlias("alias_broken", "proj_alpha", "ent_alpha", {
      aliasText: "",
    });

    const error = await captureReaderError(() =>
      reader.listCandidates("proj_alpha"),
    );

    expect(error.field).toBe("entity_aliases[alias_broken].alias_text");
    expect(error.row).toEqual({
      table: "entity_aliases",
      entityId: "ent_alpha",
      rowId: "alias_broken",
    });
    expect(error.message).toContain("alias_broken");
    expect(error.message).toContain("alias_text");
  });

  it("fails explicitly on an empty stored entity id", async () => {
    await seedEntity("", "proj_alpha", { canonicalName: "Ghost" });

    const error = await captureReaderError(() =>
      reader.listCandidates("proj_alpha"),
    );

    expect(error.field).toBe("tracked_entities[].id");
    expect(error.row).toEqual({
      table: "tracked_entities",
      entityId: "",
      rowId: "",
    });
  });

  it("fails explicitly on an empty stored alias id", async () => {
    await seedEntity("ent_alpha", "proj_alpha", { canonicalName: "Acme" });
    await seedAlias("", "proj_alpha", "ent_alpha", { aliasText: "Acme Inc" });

    const error = await captureReaderError(() =>
      reader.listCandidates("proj_alpha"),
    );

    expect(error.field).toBe("entity_aliases[].id");
    expect(error.row).toEqual({
      table: "entity_aliases",
      entityId: "ent_alpha",
      rowId: "",
    });
  });

  it("never considers an ineligible row, so its unusable values are not read", async () => {
    await seedEntity("ent_alpha", "proj_alpha", { canonicalName: "Acme" });
    // Ineligible by storage rule, not skipped after being read: an inactive
    // entity and a non-EXACT alias may legitimately hold values this reader
    // could not turn into a literal candidate.
    await seedEntity("ent_off", "proj_alpha", {
      canonicalName: "",
      active: false,
    });
    await seedAlias("alias_domain", "proj_alpha", "ent_alpha", {
      aliasText: "",
      matchMode: "DOMAIN",
    });

    expect(await reader.listCandidates("proj_alpha")).toEqual([
      canonical("ent_alpha", "Acme"),
    ]);
  });
});
