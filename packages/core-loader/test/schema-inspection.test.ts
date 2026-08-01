import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseCanonicalJsonBytes } from "@open-hadith/canonical-json";
import {
  EXPECTED_SCHEMA_PATHS,
  inspectSchemaCatalog,
} from "@open-hadith/core-loader";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../..");

async function schemaDocuments(): Promise<Map<string, unknown>> {
  const documents = new Map<string, unknown>();
  for (const path of EXPECTED_SCHEMA_PATHS) {
    documents.set(
      path,
      parseCanonicalJsonBytes(await readFile(resolve(repositoryRoot, "schemas", path))),
    );
  }
  return documents;
}

describe("schema catalog inspection", () => {
  test("builds a registry only from the complete valid catalog", async () => {
    const inspection = inspectSchemaCatalog(await schemaDocuments());
    expect(inspection.issues).toEqual([]);
    expect(inspection.registry?.schemaCount).toBe(6);
  });

  test("classifies identifier, meta-schema, and reference defects", async () => {
    const idDocuments = await schemaDocuments();
    idDocuments.set("source/v1.schema.json", {
      ...(idDocuments.get("source/v1.schema.json") as object),
      $id: "https://example.invalid/source.json",
    });
    expect(inspectSchemaCatalog(idDocuments).issues).toContainEqual(
      expect.objectContaining({ kind: "id_mismatch", relativePath: "source/v1.schema.json" }),
    );

    const metaDocuments = await schemaDocuments();
    metaDocuments.set("source/v1.schema.json", {
      ...(metaDocuments.get("source/v1.schema.json") as object),
      type: 7,
    });
    expect(inspectSchemaCatalog(metaDocuments).issues).toContainEqual(
      expect.objectContaining({ kind: "meta_invalid", relativePath: "source/v1.schema.json" }),
    );

    const referenceDocuments = await schemaDocuments();
    referenceDocuments.set("source/v1.schema.json", {
      ...(referenceDocuments.get("source/v1.schema.json") as object),
      properties: { title: { $ref: "https://example.invalid/schema.json" } },
    });
    expect(inspectSchemaCatalog(referenceDocuments).issues).toContainEqual(
      expect.objectContaining({
        kind: "reference_invalid",
        relativePath: "source/v1.schema.json",
      }),
    );
  });
});
