import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatCanonicalJson } from "@open-hadith/canonical-json";
import { EXPECTED_SCHEMA_PATHS } from "@open-hadith/core-loader";
import {
  createRepositorySnapshot,
  createStructuralVerificationContext,
  REPOSITORY_FILE_RULES,
  runVerification,
  SEMANTIC_RULES,
  type RepositoryFileInput,
} from "@open-hadith/verifier";

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

describe("common semantic rules", () => {
  test("accepts valid whitespace, checksum, fingerprint, pages, and location", async () => {
    expect(await verify([witness(), occurrence("مثال نص\nفقرة ثانية")])).toEqual({
      kind: "complete",
      report: { findings: [], valid: true, verification_version: 1 },
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
      report: { findings: [], valid: true, verification_version: 1 },
    });
    expect(await run(malformed)).toEqual({
      kind: "complete",
      report: {
        findings: [expect.objectContaining({
          file: malformed.path,
          rule_id: "json.canonical",
        })],
        valid: false,
        verification_version: 1,
      },
    });
  });

  test("does not invent a scheme finding for an unresolved witness", async () => {
    const result = await verify([occurrence("مثال نص")]);
    expect(result).toEqual({
      kind: "complete",
      report: { findings: [], valid: true, verification_version: 1 },
    });
  });
});
