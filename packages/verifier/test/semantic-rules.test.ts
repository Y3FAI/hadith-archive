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
  REPOSITORY_FILE_RULES,
  runVerification,
  SEMANTIC_RULES,
  type RepositoryFileInput,
} from "@hadith-archive/verifier";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../..");
const encoder = new TextEncoder();

async function schemaInputs(): Promise<RepositoryFileInput[]> {
  return Promise.all(EXPECTED_SCHEMA_PATHS.map(async (path) => ({
    bytes: await readFile(resolve(repositoryRoot, "schemas", path)),
    path: `schemas/${path}`,
  })));
}

function jsonInput(path: string, value: unknown): RepositoryFileInput {
  return { bytes: encoder.encode(formatCanonicalJson(value as never)), path };
}

function fingerprint(rawText: string): string {
  return createHash("sha256").update(rawText, "utf8").digest("hex");
}

async function verify(records: readonly RepositoryFileInput[]) {
  const snapshot = createRepositorySnapshot([...await schemaInputs(), ...records]);
  return runVerification(createStructuralVerificationContext(snapshot), SEMANTIC_RULES);
}

function witness(overrides: Record<string, unknown> = {}): RepositoryFileInput {
  return jsonInput(
    "core/sources/example-work/witnesses/example-work-edition/witness.json",
    {
      edition_statement: "الطبعة الأولى",
      isbn: "9780000000002",
      priority_score: 0,
      publication_year: 2007,
      publisher: "مثال الناشر",
      record_type: "source_witness",
      reference_scheme: { hadith_number: true, volume: false },
      schema_version: 1,
      source_id: "example-work",
      title_as_printed: "مثال الكتاب",
      witness_id: "example-work-edition",
      ...overrides,
    },
  );
}

function occurrence(
  rawText: string,
  overrides: Record<string, unknown> = {},
): RepositoryFileInput {
  return jsonInput(
    "core/sources/example-work/witnesses/example-work-edition/occurrences/1.json",
    {
      fingerprint: fingerprint(rawText),
      location: { hadith_number: 1, page_end: 10, page_start: 10 },
      occurrence_id: 1,
      ordinal: 1,
      raw_text: rawText,
      record_type: "occurrence",
      schema_version: 1,
      witness_id: "example-work-edition",
      ...overrides,
    },
  );
}

function hadith(text: string): RepositoryFileInput {
  return jsonInput("core/hadith/1.json", {
    display_occurrence_id: 1,
    hadith_id: 1,
    member_occurrence_ids: [1],
    record_type: "hadith",
    schema_version: 1,
    text,
  });
}

function textRecords(text: string, rawText = text): RepositoryFileInput[] {
  return [
    jsonInput("core/sources/example-work/source.json", {
      author: text,
      priority_score: 0,
      record_type: "source",
      schema_version: 1,
      source_id: "example-work",
      title: text,
    }),
    witness({ edition_statement: text, publisher: text, title_as_printed: text }),
    jsonInput("core/sources/example-work/sections/kitab-example.json", {
      kind: "kitab",
      ordinal: 1,
      record_type: "section",
      schema_version: 1,
      section_id: "kitab-example",
      source_id: "example-work",
      title: text,
    }),
    hadith(text),
    occurrence(rawText),
  ];
}

// Every single-line field reached by text.single_line, plus the raw text and
// hadith text reached by text.raw_whitespace.
const TEXT_FIELD_KEYS = [
  "core/hadith/1.json text.raw_whitespace:/text",
  "core/sources/example-work/sections/kitab-example.json text.single_line:/title",
  "core/sources/example-work/source.json text.single_line:/author",
  "core/sources/example-work/source.json text.single_line:/title",
  "core/sources/example-work/witnesses/example-work-edition/occurrences/1.json text.raw_whitespace:/raw_text",
  "core/sources/example-work/witnesses/example-work-edition/witness.json text.single_line:/edition_statement",
  "core/sources/example-work/witnesses/example-work-edition/witness.json text.single_line:/publisher",
  "core/sources/example-work/witnesses/example-work-edition/witness.json text.single_line:/title_as_printed",
];

const BIDI_CONTROLS = [
  0x061c, 0x200e, 0x200f,
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2066, 0x2067, 0x2068, 0x2069,
];
const LAYOUT_CHARACTERS = [0x200b, 0x2060, 0xfeff];

describe("invisible format characters", () => {
  test("the rejected bidi list is exactly Unicode Bidi_Control", () => {
    const property: number[] = [];
    for (let codePoint = 0; codePoint <= 0x10ffff; codePoint += 1) {
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue;
      if (/\p{Bidi_Control}/u.test(String.fromCodePoint(codePoint))) {
        property.push(codePoint);
      }
    }
    expect(property).toEqual(BIDI_CONTROLS);
  });

  for (const codePoint of [...BIDI_CONTROLS, ...LAYOUT_CHARACTERS]) {
    const character = String.fromCodePoint(codePoint);
    const name = `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
    const placements = {
      embedded: `مثال${character}نص`,
      "between spaces": `مثال ${character} نص`,
      leading: `${character}مثال نص`,
      trailing: `مثال نص${character}`,
    };
    for (const [placement, text] of Object.entries(placements)) {
      test(`rejects ${name} ${placement} in every text field`, async () => {
        // The occurrence fingerprint is computed over the polluted text, so
        // only the text rules may report it, and nothing is repaired.
        const result = await verify(textRecords(text));
        expect(result.kind).toBe("complete");
        if (result.kind !== "complete") return;
        const keys = result.report.findings
          .map((item) => `${item.file} ${item.rule_id}:${item.instance_path}`)
          .sort();
        expect(keys).toEqual(TEXT_FIELD_KEYS);
      });
    }
  }

  test("preserves diacritics, tatweel, joiners, supplementary characters, and LF", async () => {
    const [zwnj, zwj] = [0x200c, 0x200d].map((codePoint) => String.fromCodePoint(codePoint));
    const text = `قَالَ رَسُولُ اللهِ قـال می${zwnj}خواهم لا${zwj}م ${String.fromCodePoint(0x1ee00)}`;
    expect(text.normalize("NFC")).toBe(text);
    expect(await verify(textRecords(text, `${text}\n${text}`))).toEqual({
      kind: "complete",
      report: { findings: [], valid: true, verification_version: 3 },
    });
  });
});

describe("hadith text whitespace", () => {
  test("accepts text that keeps a stored LF", async () => {
    expect(await verify([hadith("مثال نص\nفقرة ثانية")])).toEqual({
      kind: "complete",
      report: { findings: [], valid: true, verification_version: 3 },
    });
  });

  for (const text of [
    " مثال", "مثال ", "\nمثال", "مثال\n", "مثال  نص", "مثال\n\nنص",
    "مثال \nنص", "مثال\n نص", "مثال\tنص", "مثال\rنص", "مثال نص",
  ]) {
    test(`rejects ${JSON.stringify(text)} as raw-text whitespace`, async () => {
      expect(await verify([hadith(text)])).toEqual({
        kind: "complete",
        report: {
          findings: [{
            file: "core/hadith/1.json",
            instance_path: "/text",
            message: "Raw text violates preserved whitespace rules",
            rule_id: "text.raw_whitespace",
          }],
          valid: false,
          verification_version: 3,
        },
      });
    });
  }
});

describe("common semantic rules", () => {
  test("accepts valid whitespace, checksum, fingerprint, pages, and location", async () => {
    expect(await verify([witness(), occurrence("مثال نص\nفقرة ثانية")])).toEqual({
      kind: "complete",
      report: { findings: [], valid: true, verification_version: 3 },
    });
  });

  test("reports single-line and raw-text whitespace violations", async () => {
    const source = jsonInput("core/sources/example/source.json", {
      author: "مثال",
      priority_score: 0,
      record_type: "source",
      schema_version: 1,
      source_id: "example",
      title: " مثال",
    });
    const result = await verify([source, occurrence("مثال  نص")]);

    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      expect(result.report.findings).toContainEqual(expect.objectContaining({
        instance_path: "/title",
        rule_id: "text.single_line",
      }));
      expect(result.report.findings).toContainEqual(expect.objectContaining({
        instance_path: "/raw_text",
        rule_id: "text.raw_whitespace",
      }));
    }
  });

  test("reports checksum, fingerprint, page-order, and scheme violations", async () => {
    const rawText = "مثال نص";
    const result = await verify([
      witness({ isbn: "9780000000003" }),
      occurrence(rawText, {
        fingerprint: "0".repeat(64),
        location: { page_end: 9, page_start: 10, volume: 1 },
      }),
    ]);

    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      const keys = result.report.findings.map(
        (item) => `${item.rule_id}:${item.instance_path}`,
      );
      expect(keys).toContain("witness.isbn_checksum:/isbn");
      expect(keys).toContain("occurrence.fingerprint_matches:/fingerprint");
      expect(keys).toContain("occurrence.page_order:/location/page_end");
      expect(keys).toContain(
        "occurrence.location_matches_scheme:/location/hadith_number",
      );
      expect(keys).toContain("occurrence.location_matches_scheme:/location/volume");
    }
  });

  test("rejects an unpaired surrogate whose fingerprint collides with U+FFFD", async () => {
    const replacement = occurrence("قال � رسول الله");
    const malformed = {
      ...replacement,
      bytes: encoder.encode(
        new TextDecoder().decode(replacement.bytes).replace("�", "\\ud800"),
      ),
    };
    // Node and Bun encode a lone surrogate as U+FFFD, so the hashes collide.
    expect(fingerprint("قال \ud800 رسول الله")).toBe(fingerprint("قال � رسول الله"));

    const rules = [...REPOSITORY_FILE_RULES, ...SEMANTIC_RULES];
    const run = async (file: RepositoryFileInput) => runVerification(
      createStructuralVerificationContext(
        createRepositorySnapshot([...await schemaInputs(), witness(), file]),
      ),
      rules,
    );

    expect(await run(replacement)).toEqual({
      kind: "complete",
      report: { findings: [], valid: true, verification_version: 3 },
    });
    expect(await run(malformed)).toEqual({
      kind: "complete",
      report: {
        findings: [expect.objectContaining({
          file: malformed.path,
          rule_id: "json.canonical",
        })],
        valid: false,
        verification_version: 3,
      },
    });
  });

  test("does not invent a scheme finding for an unresolved witness", async () => {
    const result = await verify([occurrence("مثال نص")]);
    expect(result).toEqual({
      kind: "complete",
      report: { findings: [], valid: true, verification_version: 3 },
    });
  });
});
