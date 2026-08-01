import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatCanonicalJson, parseCanonicalJsonBytes } from "@open-hadith/canonical-json";
import { EXPECTED_SCHEMA_PATHS } from "@open-hadith/core-loader";
import {
  createRepositorySnapshot,
  createStructuralVerificationContext,
  runVerification,
  STRUCTURAL_RULES,
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

async function verify(inputs: readonly RepositoryFileInput[]) {
  const snapshot = createRepositorySnapshot(inputs);
  return runVerification(createStructuralVerificationContext(snapshot), STRUCTURAL_RULES);
}

describe("schema and record rules", () => {
  test("accepts a valid record at its exact declared path", async () => {
    const result = await verify([
      ...await schemaInputs(),
      jsonInput("core/sources/example-work/source.json", {
        author: "مثال المؤلف",
        priority_score: 0,
        record_type: "source",
        schema_version: 1,
        source_id: "example-work",
        title: "مثال الكتاب",
      }),
    ]);

    expect(result).toEqual({
      kind: "complete",
      report: { findings: [], valid: true, verification_version: 1 },
    });
  });

  test("reports each missing required schema", async () => {
    const inputs = await schemaInputs();
    const result = await verify(inputs.filter(
      (input) => input.path !== "schemas/source/v1.schema.json",
    ));

    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      expect(result.report.findings).toContainEqual(expect.objectContaining({
        file: "schemas/source/v1.schema.json",
        rule_id: "schema.catalog_complete",
      }));
    }
  });

  test("maps schema inspection defects to their named rules", async () => {
    const inputs = await schemaInputs();
    const source = parseCanonicalJsonBytes(
      inputs.find((input) => input.path === "schemas/source/v1.schema.json")?.bytes ??
        new Uint8Array(),
    );
    source["$id"] = "https://example.invalid/source.json";
    const changed = inputs.map((input) => input.path === "schemas/source/v1.schema.json"
      ? jsonInput(input.path, source)
      : input);
    const result = await verify(changed);

    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      expect(result.report.findings).toContainEqual(expect.objectContaining({
        instance_path: "/$id",
        rule_id: "schema.id_matches_path",
      }));
    }
  });

  test("distinguishes unknown, invalid, and misplaced records", async () => {
    const schemas = await schemaInputs();
    const unknown = await verify([
      ...schemas,
      jsonInput("core/sources/example/source.json", {
        record_type: "source",
        schema_version: 2,
      }),
    ]);
    const invalid = await verify([
      ...schemas,
      jsonInput("core/sources/example/source.json", {
        author: "مثال",
        priority_score: 0,
        record_type: "source",
        schema_version: 1,
        source_id: "example",
      }),
    ]);
    const misplaced = await verify([
      ...schemas,
      jsonInput("core/sources/wrong/source.json", {
        author: "مثال",
        priority_score: 0,
        record_type: "source",
        schema_version: 1,
        source_id: "example",
        title: "مثال",
      }),
    ]);

    for (const [result, ruleId] of [
      [unknown, "record.schema_known"],
      [invalid, "record.schema_valid"],
      [misplaced, "record.path_matches"],
    ] as const) {
      expect(result.kind).toBe("complete");
      if (result.kind === "complete") {
        expect(result.report.findings).toContainEqual(
          expect.objectContaining({ rule_id: ruleId }),
        );
      }
    }
  });

  test("matches occurrence provenance paths through the unique witness", async () => {
    const rawText = "مثال";
    const schemas = await schemaInputs();
    const witness = jsonInput(
      "core/sources/example/witnesses/example-edition/witness.json",
      {
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
      },
    );
    const occurrence = jsonInput(
      "core/sources/wrong/witnesses/example-edition/occurrences/1.json",
      {
        fingerprint: "0".repeat(64),
        location: { hadith_number: 1, page_end: 1, page_start: 1 },
        occurrence_id: 1,
        ordinal: 1,
        raw_text: rawText,
        record_type: "occurrence",
        schema_version: 1,
        witness_id: "example-edition",
      },
    );
    const result = await verify([...schemas, witness, occurrence]);

    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      expect(result.report.findings).toContainEqual(expect.objectContaining({
        file: "core/sources/wrong/witnesses/example-edition/occurrences/1.json",
        rule_id: "record.path_matches",
      }));
    }
  });
});
