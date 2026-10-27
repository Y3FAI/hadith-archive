import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_NESTING_DEPTH } from "@hadith-archive/canonical-json";
import {
  createCoreLoader,
  type LoadedCoreRecord,
} from "@hadith-archive/core-loader";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../..");
const fixtureRoot = resolve(currentDirectory, "fixtures");
const loader = await createCoreLoader(repositoryRoot);

function fixturePath(...parts: string[]): string {
  return resolve(fixtureRoot, ...parts);
}

function assertExhaustiveRecord(record: LoadedCoreRecord): string {
  switch (record.record_type) {
    case "hadith":
      return record.title;
    case "occurrence":
      return record.raw_text;
    case "section":
      return record.title;
    case "source":
      return record.title;
    case "source_witness":
      return record.title_as_printed;
  }
}

describe("core loader", () => {
  test("loads a structurally valid record as a discriminated generated type", async () => {
    const result = await loader.loadFile(
      fixturePath("valid", "source-witness.json"),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected the fixture to load");
    }

    expect(assertExhaustiveRecord(result.record)).toBe("مثال عنوان الكتاب");
    expect(result.record.record_type).toBe("source_witness");
  });

  test("deep-freezes loaded records, including nested objects", async () => {
    const result = await loader.loadFile(
      fixturePath("valid", "source-witness.json"),
    );
    if (!result.ok || result.record.record_type !== "source_witness") {
      throw new Error("Expected a source-witness record");
    }

    const record: LoadedCoreRecord = result.record;
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.reference_scheme)).toBe(true);
    expect(() => {
      Reflect.set(record.reference_scheme, "volume", true);
    }).not.toThrow();
    expect(record.reference_scheme.volume).toBe(false);
  });

  test("returns stable canonical JSON diagnostics before schema validation", () => {
    const result = loader.loadBytes(
      new TextEncoder().encode(
        '{"schema_version":1,"record_type":"source"}\n',
      ),
    );

    expect(result).toEqual({
      failure: expect.objectContaining({
        code: "non_canonical",
        kind: "canonical_json",
      }),
      ok: false,
    });
  });

  test("returns sorted structural validation errors", async () => {
    const result = await loader.loadFile(
      fixturePath("invalid", "source-missing-title.json"),
    );

    expect(result).toEqual({
      failure: {
        errors: [
          expect.objectContaining({
            instancePath: "",
            keyword: "required",
          }),
        ],
        kind: "schema_invalid",
      },
      ok: false,
    });
  });

  test("distinguishes an unknown record schema from an invalid known schema", async () => {
    const result = await loader.loadFile(
      fixturePath("invalid", "source-unknown-schema.json"),
    );

    expect(result).toEqual({
      failure: {
        kind: "schema_unknown",
        recordType: "source",
        schemaVersion: 2,
      },
      ok: false,
    });
  });

  test("rejects a non-object at the canonical JSON boundary", () => {
    expect(loader.loadBytes(new TextEncoder().encode("null\n"))).toEqual({
      failure: {
        code: "top_level",
        kind: "canonical_json",
        message: "A canonical core JSON file contains one top-level object",
      },
      ok: false,
    });
  });

  test("rejects an unpaired surrogate before schema validation", () => {
    const source = '{\n  "author": "مثال",\n  "priority_score": 0,\n  "record_type": "source",\n  "schema_version": 1,\n  "source_id": "example",\n  "title": "مثال \\udc00"\n}\n';
    expect(loader.loadBytes(new TextEncoder().encode(source))).toEqual({
      failure: {
        code: "ill_formed_unicode",
        kind: "canonical_json",
        message: "JSON string contains an unpaired UTF-16 surrogate",
        offset: source.indexOf('"مثال \\udc00"'),
      },
      ok: false,
    });
  });

  test("rejects excessive nesting as a structured failure", () => {
    const arrays = MAX_NESTING_DEPTH;
    const source = `{"a":${"[".repeat(arrays)}${"]".repeat(arrays)}}\n`;
    expect(loader.loadBytes(new TextEncoder().encode(source))).toEqual({
      failure: {
        code: "nesting_depth",
        kind: "canonical_json",
        message: `JSON nests more than ${MAX_NESTING_DEPTH} levels`,
        offset: source.lastIndexOf("["),
      },
      ok: false,
    });
  });

  test("reports file read failures without throwing", async () => {
    const result = await loader.loadFile(
      fixturePath("missing", "record.json"),
    );

    expect(result).toEqual({
      failure: {
        kind: "read_error",
        message: "Core record could not be read",
      },
      ok: false,
    });
  });

  test("loads canonical bytes read independently of the file helper", async () => {
    const bytes = await readFile(fixturePath("valid", "source-witness.json"));
    const result = loader.loadBytes(bytes);

    expect(result.ok).toBe(true);
  });
});
