import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createSchemaRegistry } from "@open-hadith/core-loader";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../..");
const fixtureRoot = resolve(currentDirectory, "fixtures");
const registry = await createSchemaRegistry(repositoryRoot);

async function readJsonFiles(directory: string): Promise<unknown[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    files.map(async (file) => {
      const source = await readFile(resolve(directory, file), "utf8");
      return JSON.parse(source) as unknown;
    }),
  );
}

describe("version-one schema catalog", () => {
  test("loads and compiles all six schemas offline", () => {
    expect(registry.schemaCount).toBe(6);
  });

  test("accepts one valid fixture for every entity", async () => {
    const fixtures = await readJsonFiles(resolve(fixtureRoot, "valid"));
    expect(fixtures).toHaveLength(5);

    for (const fixture of fixtures) {
      const result = registry.validateRecord(fixture);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  test("accepts the maximum safe positive integer", async () => {
    const fixtures = await readJsonFiles(
      resolve(fixtureRoot, "valid", "record.schema_valid"),
    );
    expect(fixtures).toHaveLength(1);

    const result = registry.validateRecord(fixtures[0]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  test("rejects the first integer above the safe boundary", async () => {
    const source = await readFile(
      resolve(
        fixtureRoot,
        "invalid",
        "record.schema_valid",
        "hadith-unsafe-id.json",
      ),
      "utf8",
    );
    const result = registry.validateRecord(JSON.parse(source) as unknown);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        instancePath: "/hadith_id",
        keyword: "maximum",
      }),
    );
  });

  test("rejects every structurally invalid fixture", async () => {
    const fixtures = await readJsonFiles(
      resolve(fixtureRoot, "invalid", "record.schema_valid"),
    );
    expect(fixtures).toHaveLength(8);

    for (const fixture of fixtures) {
      const result = registry.validateRecord(fixture);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});
