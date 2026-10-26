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

  test("rejects only the intended defect in each identifier-bound hadith fixture", async () => {
    for (const [file, keyword] of [
      ["hadith-unsafe-id.json", "maximum"],
      ["hadith-zero-id.json", "minimum"],
    ] as const) {
      const source = await readFile(
        resolve(fixtureRoot, "invalid", "record.schema_valid", file),
        "utf8",
      );
      const result = registry.validateRecord(JSON.parse(source) as unknown);
      expect(result.errors.map((error) => `${error.instancePath} ${error.keyword}`))
        .toEqual([`/hadith_id ${keyword}`]);
    }
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

describe("version-one hadith membership structure", () => {
  const validFixture = async (name: string): Promise<Record<string, unknown>> =>
    JSON.parse(await readFile(resolve(fixtureRoot, "valid", name), "utf8")) as
      Record<string, unknown>;

  async function membershipErrors(members: unknown): Promise<string[]> {
    const hadith = await validFixture("hadith.json");
    const record = members === undefined
      ? Object.fromEntries(Object.entries(hadith).filter(([key]) => key !== "member_occurrence_ids"))
      : { ...hadith, member_occurrence_ids: members };
    const result = registry.validateRecord(record);
    expect(result.valid).toBe(result.errors.length === 0);
    return result.errors.map((error) => `${error.instancePath} ${error.keyword}`);
  }

  test("accepts singleton, multi-member, and maximum safe member identifiers", async () => {
    expect(await membershipErrors([1])).toEqual([]);
    expect(await membershipErrors([1, 2, 10])).toEqual([]);
    expect(await membershipErrors([1, 9007199254740991])).toEqual([]);
  });

  test("requires a member list", async () => {
    expect(await membershipErrors(undefined)).toEqual([" required"]);
  });

  test("rejects an empty member list", async () => {
    expect(await membershipErrors([])).toEqual(["/member_occurrence_ids minItems"]);
  });

  test("rejects a repeated member", async () => {
    expect(await membershipErrors([1, 2, 1])).toEqual(["/member_occurrence_ids uniqueItems"]);
  });

  test("rejects malformed member lists and identifiers", async () => {
    expect(await membershipErrors(1)).toEqual(["/member_occurrence_ids type"]);
    expect(await membershipErrors({ 0: 1 })).toEqual(["/member_occurrence_ids type"]);
    expect(await membershipErrors([1, 0])).toEqual(["/member_occurrence_ids/1 minimum"]);
    expect(await membershipErrors([-3])).toEqual(["/member_occurrence_ids/0 minimum"]);
    expect(await membershipErrors([1.5])).toEqual(["/member_occurrence_ids/0 type"]);
    expect(await membershipErrors(["1"])).toEqual(["/member_occurrence_ids/0 type"]);
    expect(await membershipErrors([9007199254740992])).toEqual([
      "/member_occurrence_ids/0 maximum",
    ]);
  });

  test("leaves numeric member order to semantic verification", async () => {
    // Ordering is a cross-element rule with its own identifier, hadith.member_order.
    expect(await membershipErrors([10, 2])).toEqual([]);
  });

  test("rejects the legacy occurrence hadith reference", async () => {
    const occurrence = await validFixture("occurrence.json");
    expect(registry.validateRecord(occurrence).valid).toBe(true);
    const result = registry.validateRecord({ ...occurrence, hadith_id: 1 });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([expect.objectContaining({
      instancePath: "",
      keyword: "additionalProperties",
      params: { additionalProperty: "hadith_id" },
    })]);
  });
});
