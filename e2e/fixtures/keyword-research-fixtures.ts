import type { KeywordResearchRow, SerpResultItem } from "@/types/keywords";
import type { ResolvedResearchKeywordsInput } from "@/types/schemas/keywords";

const MONTHLY_SEARCHES = [
  { year: 2025, month: 4, searchVolume: 1200 },
  { year: 2025, month: 5, searchVolume: 1600 },
  { year: 2025, month: 6, searchVolume: 2400 },
  { year: 2025, month: 7, searchVolume: 3200 },
  { year: 2025, month: 8, searchVolume: 4200 },
  { year: 2025, month: 9, searchVolume: 3600 },
  { year: 2025, month: 10, searchVolume: 3000 },
  { year: 2025, month: 11, searchVolume: 2600 },
  { year: 2025, month: 12, searchVolume: 2200 },
  { year: 2026, month: 1, searchVolume: 2100 },
  { year: 2026, month: 2, searchVolume: 2300 },
  { year: 2026, month: 3, searchVolume: 2800 },
];

function makeRow(
  keyword: string,
  index: number,
  overrides: Partial<KeywordResearchRow> = {},
): KeywordResearchRow {
  return {
    keyword,
    searchVolume: 20_000 - index * 750,
    trend: MONTHLY_SEARCHES,
    keywordDifficulty: 40 + (index % 40),
    cpc: Number((1.25 + index * 0.15).toFixed(2)),
    competition: Number((0.05 + (index % 10) * 0.04).toFixed(2)),
    intent: index % 3 === 0 ? "commercial" : "informational",
    ...overrides,
  };
}

/** Number of organic rows every fixture SERP returns (one full panel page). */
const SERP_FIXTURE_ITEM_COUNT = 10;
const SERP_FIXTURE_SUFFIXES = [
  "guide",
  "tools",
  "examples",
  "checklist",
  "for beginners",
  "alternatives",
  "best practices",
  "pricing",
  "reviews",
  "templates",
] as const;

function slugifyKeyword(keyword: string): string {
  return (
    keyword
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "keyword"
  );
}

function makeSerpItem(keyword: string, rank: number): SerpResultItem {
  const slug = slugifyKeyword(keyword);
  // .test is a reserved TLD that never resolves, so fixture URLs are safe even
  // if a test ever navigates one.
  const domain = rank === 1 ? `${slug}.test` : `example-${rank}.test`;
  const suffixIndex = (rank - 1) % SERP_FIXTURE_SUFFIXES.length;
  const suffix = SERP_FIXTURE_SUFFIXES[suffixIndex];
  const url =
    rank === 1
      ? `https://${domain}/`
      : `https://${domain}/${slug}-${suffix.replace(/ /g, "-")}`;
  const title = rank === 1 ? keyword : `${keyword} ${suffix}`;
  return {
    rank,
    title,
    url,
    domain,
    description: `Deterministic fixture SERP result ${rank} for "${keyword}".`,
    etv: rank === 1 ? 5200 : 5200 - (rank - 1) * 500,
    estimatedPaidTrafficCost: Number(
      (rank === 1 ? 428.5 : 428.5 - (rank - 1) * 36.2).toFixed(2),
    ),
    referringDomains: rank === 1 ? 2100 : 2100 - (rank - 1) * 190,
    backlinks: rank === 1 ? 48_000 : 48_000 - (rank - 1) * 3_900,
    isNew: false,
    rankChange: null,
  };
}

/**
 * Deterministic SERP snapshot for E2E fixture mode. Mirrors the real
 * getSerpAnalysis response contract ({@link SerpResultItem} rows plus the
 * requested depth) so fixture output is indistinguishable in shape from a live
 * DataForSEO snapshot — it is just local and repeatable.
 */
export function getSerpAnalysisFixture(input: {
  keyword: string;
  depth?: number;
}) {
  const requestedKeyword = input.keyword.trim().toLowerCase();
  const depth = input.depth ?? 20;
  const items = Array.from({ length: SERP_FIXTURE_ITEM_COUNT }, (_, index) =>
    makeSerpItem(input.keyword, index + 1),
  );
  return { requestedKeyword, items, depth };
}

export function getKeywordResearchFixture(data: ResolvedResearchKeywordsInput) {
  const seedKeyword = data.keywords[0] ?? "keyword research";
  const rows = [
    makeRow(seedKeyword, 0, {
      searchVolume: 288_431,
      keywordDifficulty: 78,
      cpc: 11.93,
      competition: 0.07,
      intent: "informational",
    }),
    makeRow(`${seedKeyword} tools`, 1),
    makeRow(`${seedKeyword} software`, 2),
    makeRow(`${seedKeyword} checklist`, 3),
    makeRow(`${seedKeyword} template`, 4),
    makeRow(`${seedKeyword} examples`, 5),
    makeRow(`${seedKeyword} guide`, 6),
    makeRow(`${seedKeyword} strategy`, 7),
    makeRow(`${seedKeyword} platform`, 8),
    makeRow(`${seedKeyword} generator`, 9),
  ];

  return {
    rows,
    source: "related" as const,
    usedFallback: false,
    diagnostics: {
      requestedMode: data.mode,
      threshold: 3,
      sourceAttempts: [
        {
          source: "related" as const,
          rowCount: rows.length,
          nonSeedCount: rows.length - 1,
        },
      ],
    },
  };
}
