import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatCanonicalJson } from "@hadith-archive/canonical-json";
import { EXPECTED_SCHEMA_PATHS } from "@hadith-archive/core-loader";
import {
  createRepositorySnapshot,
  createStructuralVerificationContext,
  GRAPH_RULES,
  runVerification,
  type RepositoryFileInput,
} from "@hadith-archive/verifier";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../..");
const encoder = new TextEncoder();

async function schemas(): Promise<RepositoryFileInput[]> {
  return Promise.all(EXPECTED_SCHEMA_PATHS.map(async (path) => ({
    bytes: await readFile(resolve(repositoryRoot, "schemas", path)),
    path: `schemas/${path}`,
  })));
}

function input(path: string, value: unknown): RepositoryFileInput {
  return { bytes: encoder.encode(formatCanonicalJson(value as never)), path };
}

function fingerprint(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function verify(records: readonly RepositoryFileInput[]) {
  const snapshot = createRepositorySnapshot([...await schemas(), ...records]);
  return runVerification(createStructuralVerificationContext(snapshot), GRAPH_RULES);
}

function source(path = "core/sources/example/source.json", id = "example") {
  return input(path, {
    author: "مثال",
    priority_score: 0,
    record_type: "source",
    schema_version: 1,
    source_id: id,
    title: "مثال",
  });
}

function witness(
  path = "core/sources/example/witnesses/example-edition/witness.json",
  overrides: Record<string, unknown> = {},
) {
  return input(path, {
    edition_statement: "الطبعة الأولى",
    isbn: "9780000000002",
    priority_score: 0,
    publication_year: 2007,
    publisher: "مثال",
    record_type: "source_witness",
    reference_scheme: { hadith_number: true, volume: false },
    schema_version: 1,
    source_id: "example",
    title_as_printed: "مثال",
    witness_id: "example-edition",
    ...overrides,
  });
}

function section(
  path: string,
  id: string,
  ordinal: number,
  parent?: string,
) {
  return input(path, {
    kind: "bab",
    ordinal,
    ...(parent === undefined ? {} : { parent_section_id: parent }),
    record_type: "section",
    schema_version: 1,
    section_id: id,
    source_id: "example",
    title: `قسم ${id}`,
  });
}

function occurrence(
  path = "core/sources/example/witnesses/example-edition/occurrences/1.json",
  overrides: Record<string, unknown> = {},
) {
  const rawText = "عنوان حديث كامل";
  return input(path, {
    fingerprint: fingerprint(rawText),
    location: { hadith_number: 1, page_end: 10, page_start: 10 },
    occurrence_id: 1,
    ordinal: 1,
    raw_text: rawText,
    record_type: "occurrence",
    schema_version: 1,
    section_id: "child",
    witness_id: "example-edition",
    ...overrides,
  });
}

function hadith(
  path = "core/hadith/1.json",
  overrides: Record<string, unknown> = {},
) {
  return input(path, {
    description: "كامل",
    display_occurrence_id: 1,
    hadith_id: 1,
    heading: "حديث",
    member_occurrence_ids: [1],
    record_type: "hadith",
    schema_version: 1,
    title: "عنوان",
    ...overrides,
  });
}

function validGraph(): RepositoryFileInput[] {
  return [
    source(),
    witness(),
    section("core/sources/example/sections/root.json", "root", 1),
    section("core/sources/example/sections/child.json", "child", 2, "root"),
    occurrence(),
    hadith(),
  ];
}

async function ruleIds(records: readonly RepositoryFileInput[]): Promise<string[]> {
  const result = await verify(records);
  expect(result.kind).toBe("complete");
  return result.kind === "complete"
    ? result.report.findings.map((finding) => finding.rule_id)
    : [];
}

describe("cross-record graph rules", () => {
  test("accepts a complete consistent graph", async () => {
    expect(await verify(validGraph())).toEqual({
      kind: "complete",
      report: { findings: [], valid: true, verification_version: 2 },
    });
  });

  test("detects all five entity identifier collision scopes", async () => {
    const records = validGraph();
    records.push(
      source("core/sources/duplicate/source.json", "example"),
      witness(
        "core/sources/example/witnesses/duplicate/witness.json",
        { witness_id: "example-edition" },
      ),
      section("core/sources/example/sections/duplicate.json", "child", 3),
      occurrence(
        "core/sources/example/witnesses/example-edition/occurrences/2.json",
        { occurrence_id: 1, ordinal: 2 },
      ),
      hadith("core/hadith/2.json", { hadith_id: 1 }),
    );
    const ids = await ruleIds(records);

    for (const id of [
      "identifier.source_unique",
      "identifier.witness_unique",
      "identifier.section_unique",
      "identifier.occurrence_unique",
      "identifier.hadith_unique",
    ]) {
      expect(ids).toContain(id);
    }
  });

  test("enforces witness prefixes and complete ordinal sequences", async () => {
    const ids = await ruleIds([
      source(),
      witness(undefined, { witness_id: "edition" }),
      section("core/sources/example/sections/root.json", "root", 2),
      occurrence(undefined, { ordinal: 2, witness_id: "edition" }),
    ]);

    expect(ids).toContain("witness.source_prefix");
    expect(ids).toContain("section.ordinal_sequence");
    expect(ids).toContain("occurrence.ordinal_sequence");
  });

  test("requires every source, witness, section, member, and display reference", async () => {
    const ids = await ruleIds([
      witness(undefined, { source_id: "missing", witness_id: "missing-edition" }),
      section("core/sources/example/sections/child.json", "child", 1, "missing"),
      occurrence(undefined, {
        section_id: "missing",
        witness_id: "missing-witness",
      }),
      hadith(undefined, { display_occurrence_id: 99, member_occurrence_ids: [99] }),
    ]);

    expect(ids).toContain("reference.source_resolves");
    expect(ids).toContain("reference.witness_resolves");
    expect(ids).toContain("reference.section_resolves");
    expect(ids).toContain("reference.member_occurrence_resolves");
    expect(ids).toContain("reference.display_occurrence_resolves");
  });

  test("detects section cycles and noncontiguous depth-first order", async () => {
    const cycleIds = await ruleIds([
      section("core/sources/example/sections/a.json", "a", 1, "b"),
      section("core/sources/example/sections/b.json", "b", 2, "a"),
    ]);
    expect(cycleIds).toContain("section.parent_acyclic");

    const orderIds = await ruleIds([
      section("core/sources/example/sections/root.json", "root", 1),
      section("core/sources/example/sections/other.json", "other", 2),
      section("core/sources/example/sections/child.json", "child", 3, "root"),
    ]);
    expect(orderIds).toContain("section.depth_first_order");
  });

  test("enforces display membership and extracted spans", async () => {
    const ids = await ruleIds([
      occurrence(),
      occurrence(
        "core/sources/example/witnesses/example-edition/occurrences/2.json",
        { occurrence_id: 2, ordinal: 2 },
      ),
      hadith(undefined, {
        description: "غير موجود",
        heading: "غير موجود",
        member_occurrence_ids: [2],
        title: "غير موجود",
      }),
    ]);
    expect(ids).toContain("hadith.display_is_member");
    expect(ids).toContain("hadith.extracted_spans");
  });
});

describe("hadith membership", () => {
  function occurrenceAt(id: number, ordinal = id) {
    return occurrence(
      `core/sources/example/witnesses/example-edition/occurrences/${id}.json`,
      { occurrence_id: id, ordinal },
    );
  }

  function occurrencesThrough(count: number): RepositoryFileInput[] {
    return Array.from({ length: count }, (_, index) => occurrenceAt(index + 1));
  }

  function group(id: number, members: readonly number[], display = members[0]) {
    return hadith(`core/hadith/${id}.json`, {
      display_occurrence_id: display,
      hadith_id: id,
      member_occurrence_ids: members,
    });
  }

  async function findings(records: readonly RepositoryFileInput[]): Promise<string[]> {
    const result = await verify([
      source(),
      witness(),
      section("core/sources/example/sections/root.json", "root", 1),
      section("core/sources/example/sections/child.json", "child", 2, "root"),
      ...records,
    ]);
    expect(result.kind).toBe("complete");
    return result.kind === "complete"
      ? result.report.findings.map((item) =>
          `${item.file} ${item.rule_id} ${item.instance_path}`
        )
      : [];
  }

  test("accepts ungrouped occurrences, singletons, and multi-member groups", async () => {
    expect(await findings([
      ...occurrencesThrough(5),
      group(1, [1]),
      // The display occurrence need not be the lowest member.
      group(2, [2, 4], 4),
      // Occurrences 3 and 5 belong to no hadith.
    ])).toEqual([]);
  });

  test("orders members numerically rather than lexicographically", async () => {
    expect(await findings([...occurrencesThrough(10), group(1, [2, 10])])).toEqual([]);
    expect(await findings([...occurrencesThrough(10), group(1, [10, 2])])).toEqual([
      "core/hadith/1.json hadith.member_order /member_occurrence_ids",
    ]);
    expect(await findings([...occurrencesThrough(10), group(1, [1, 3, 2], 1)])).toEqual([
      "core/hadith/1.json hadith.member_order /member_occurrence_ids",
    ]);
  });

  test("requires every member to resolve to exactly one occurrence", async () => {
    expect(await findings([...occurrencesThrough(2), group(1, [1, 2, 5], 1)])).toEqual([
      "core/hadith/1.json reference.member_occurrence_resolves /member_occurrence_ids/2",
    ]);

    const ambiguous = occurrence(
      "core/sources/example/witnesses/example-edition/occurrences/3.json",
      { occurrence_id: 2, ordinal: 3 },
    );
    expect(await findings([...occurrencesThrough(2), ambiguous, group(1, [1, 2], 1)])).toEqual([
      "core/hadith/1.json reference.member_occurrence_resolves /member_occurrence_ids/1",
      "core/sources/example/witnesses/example-edition/occurrences/2.json identifier.occurrence_unique /occurrence_id",
      "core/sources/example/witnesses/example-edition/occurrences/3.json identifier.occurrence_unique /occurrence_id",
    ]);
  });

  test("allows an occurrence to belong to at most one hadith", async () => {
    // The shared member is the display of neither group.
    expect(await findings([...occurrencesThrough(3), group(1, [1, 2], 1), group(2, [2, 3], 3)]))
      .toEqual([
        "core/hadith/1.json hadith.member_exclusive /member_occurrence_ids/1",
        "core/hadith/2.json hadith.member_exclusive /member_occurrence_ids/0",
      ]);

    // A shared display occurrence is no different.
    expect(await findings([...occurrencesThrough(2), group(1, [1, 2], 2), group(2, [2])]))
      .toEqual([
        "core/hadith/1.json hadith.member_exclusive /member_occurrence_ids/1",
        "core/hadith/2.json hadith.member_exclusive /member_occurrence_ids/0",
      ]);
  });

  test("reports overlapping claims on a missing occurrence conservatively", async () => {
    expect(await findings([...occurrencesThrough(2), group(1, [1, 9], 1), group(2, [2, 9], 2)]))
      .toEqual([
        "core/hadith/1.json hadith.member_exclusive /member_occurrence_ids/1",
        "core/hadith/1.json reference.member_occurrence_resolves /member_occurrence_ids/1",
        "core/hadith/2.json hadith.member_exclusive /member_occurrence_ids/1",
        "core/hadith/2.json reference.member_occurrence_resolves /member_occurrence_ids/1",
      ]);
  });

  test("requires the display occurrence to be listed even when it resolves", async () => {
    expect(await findings([...occurrencesThrough(2), group(1, [1], 2)])).toEqual([
      "core/hadith/1.json hadith.display_is_member /display_occurrence_id",
    ]);
    expect(await findings([...occurrencesThrough(1), group(1, [1], 9)])).toEqual([
      "core/hadith/1.json hadith.display_is_member /display_occurrence_id",
      "core/hadith/1.json reference.display_occurrence_resolves /display_occurrence_id",
    ]);
  });

  test("changes membership without rewriting occurrence bytes", async () => {
    const occurrences = occurrencesThrough(3);
    const before = occurrences.map((file) => [...file.bytes]);

    expect(await findings([...occurrences, group(1, [1])])).toEqual([]);
    expect(await findings([...occurrences, group(1, [1, 3])])).toEqual([]);
    expect(await findings([...occurrences, group(1, [1, 3], 3), group(2, [2])])).toEqual([]);
    expect(occurrences.map((file) => [...file.bytes])).toEqual(before);
  });
});

describe("hadith extracted spans", () => {
  const niyyat = "إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ";

  async function spanPaths(
    rawText: string,
    spans: { description: string; heading: string; title: string },
  ): Promise<string[]> {
    const result = await verify([
      source(),
      witness(),
      section("core/sources/example/sections/root.json", "root", 1),
      section("core/sources/example/sections/child.json", "child", 2, "root"),
      occurrence(undefined, { fingerprint: fingerprint(rawText), raw_text: rawText }),
      hadith(undefined, spans),
    ]);
    expect(result.kind).toBe("complete");
    return result.kind === "complete"
      ? result.report.findings.map((finding) => `${finding.rule_id} ${finding.instance_path}`)
      : [];
  }

  test("accepts complete grapheme clusters, including spans inside words", async () => {
    expect(await spanPaths(niyyat, {
      description: niyyat,
      heading: "الأَعْمَالُ",
      title: "نِّيَّ",
    })).toEqual([]);
  });

  test("rejects spans that start or end inside a grapheme cluster", async () => {
    expect(await spanPaths(niyyat, {
      // Ends before the final kasra of بِالنِّيَّاتِ.
      description: "إِنَّمَا الأَعْمَالُ بِالنِّيَّات",
      // Starts with the sukun of عْ.
      heading: "ْمَالُ",
      // The lone damma of الأَعْمَالُ.
      title: "ُ",
    })).toEqual([
      "hadith.extracted_spans /description",
      "hadith.extracted_spans /heading",
      "hadith.extracted_spans /title",
    ]);
  });

  test("rejects spans that keep only some marks of a letter", async () => {
    expect(await spanPaths(niyyat, {
      // Keeps the kasra of نِّ but drops its shadda.
      description: "بِالنِ",
      // Keeps the fatha of نَّ but drops its shadda.
      heading: "إِنَ",
      title: "إِنَّ",
    })).toEqual([
      "hadith.extracted_spans /description",
      "hadith.extracted_spans /heading",
    ]);
  });

  test("accepts a later or overlapping occurrence after one that splits a cluster", async () => {
    // نَ first occurs inside نَّ, splitting its shadda, then whole in نَوَى.
    const rawText = `${niyyat}، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى`;
    expect(await spanPaths(rawText, {
      description: rawText,
      heading: "نَ",
      title: "نَوَى",
    })).toEqual([]);

    // بَب first matches at 0, splitting the second ب from its fatha, then
    // matches again at 2, overlapping the first match, on whole clusters.
    expect(await spanPaths("بَبَب", {
      description: "بَبَب",
      heading: "بَب",
      title: "بَب",
    })).toEqual([]);
  });

  test("keeps exact single-line matching", async () => {
    expect(await spanPaths(`${niyyat}\nوَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى`, {
      // A stored LF is a grapheme boundary but still cannot be crossed.
      description: "بِالنِّيَّاتِ\nوَإِنَّمَا",
      // Diacritics are not stripped before matching.
      heading: "إنما الأعمال بالنيات",
      title: "مَا نَوَى",
    })).toEqual([
      "hadith.extracted_spans /description",
      "hadith.extracted_spans /heading",
    ]);
  });

  test("treats ZWJ and supplementary characters as parts of clusters", async () => {
    const rawText = "ه‍ـ 👍🏽";
    expect(await spanPaths(rawText, {
      // The ZWJ extends ه, and the skin-tone modifier extends 👍.
      description: "ه",
      heading: "👍",
      title: "ه‍",
    })).toEqual([
      "hadith.extracted_spans /description",
      "hadith.extracted_spans /heading",
    ]);
  });
});
