import { describe, expect, test } from "bun:test";

import {
  type CanonicalJsonValue,
  formatCanonicalJson,
  MAX_NESTING_DEPTH,
} from "@open-hadith/canonical-json";
import {
  createRepositorySnapshot,
  REPOSITORY_FILE_RULES,
  repositoryCorePaths,
  repositorySchemaPaths,
  runVerification,
  type RepositorySnapshot,
} from "@open-hadith/verifier";

const encoder = new TextEncoder();
const bytes = (source: string): Uint8Array => encoder.encode(source);

async function corePathFindings(snapshot: RepositorySnapshot): Promise<string[]> {
  const result = await runVerification(snapshot, [repositoryCorePaths]);
  if (result.kind !== "complete") throw new Error("Expected complete verification");
  return result.report.findings.map((finding) => {
    expect(finding).toMatchObject({
      instance_path: "",
      message: "Core paths must match an approved record path",
      rule_id: "repository.core_paths",
    });
    return finding.file;
  });
}

const witnessPath = "core/sources/nawawi-40/witnesses/nawawi-40-test-2007-4";
const allowedCorePaths = [
  "core/hadith/1.json",
  "core/hadith/9007199254740991.json",
  "core/sources/nawawi-40/sections/kitab-al-hajj.json",
  "core/sources/nawawi-40/source.json",
  `${witnessPath}/occurrences/1842.json`,
  `${witnessPath}/witness.json`,
  `core/sources/${"a".repeat(64)}/source.json`,
  `core/sources/a/sections/${"b".repeat(96)}.json`,
  `core/sources/a/witnesses/${"c".repeat(128)}/witness.json`,
];
const rejectedCorePaths = [
  "core",
  "core/.gitkeep",
  "core/README.md",
  "core/hadith.json",
  "core/hadith/.gitkeep",
  "core/hadith/0.json",
  "core/hadith/01.json",
  "core/hadith/1",
  "core/hadith/1.json\n",
  "core/hadith/1.json.bak",
  "core/hadith/1.json\u001b",
  "core/hadith/1\t.json",
  "core/hadith/1e3.json",
  "core/hadith/2.JSON",
  "core/hadith/9007199254740992.json",
  "core/hadith/nested/1.json",
  "core/hadith/１.json",
  "core/occurrences/1.json",
  "core/sources/40-nawawi/source.json",
  "core/sources/Nawawi-40/source.json",
  "core/sources/nawawi--40/source.json",
  "core/sources/nawawi-40",
  "core/sources/nawawi-40-/source.json",
  "core/sources/nawawi-40/Source.json",
  "core/sources/nawawi-40/occurrences/1.json",
  "core/sources/nawawi-40/sections/1.json",
  "core/sources/nawawi-40/sections/kitab/bab.json",
  "core/sources/nawawi-40/source.json.bak",
  "core/sources/nawawi-40/witness.json",
  "core/sources/nawawi_40/source.json",
  `${witnessPath}/occurrences/01.json`,
  `${witnessPath}/occurrences/a.json`,
  `${witnessPath}/occurrences/1/witness.json`,
  `${witnessPath}/page-010.jpg`,
  `${witnessPath}/scan-010.tif`,
  `core/sources/${"a".repeat(65)}/source.json`,
  `core/sources/a/sections/${"b".repeat(97)}.json`,
  `core/sources/a/witnesses/${"c".repeat(129)}/witness.json`,
];

async function schemaPathFindings(snapshot: RepositorySnapshot): Promise<string[]> {
  const result = await runVerification(snapshot, [repositorySchemaPaths]);
  if (result.kind !== "complete") throw new Error("Expected complete verification");
  return result.report.findings.map((finding) => {
    expect(finding).toMatchObject({
      instance_path: "",
      message: "Schema paths must match a registered catalog schema",
      rule_id: "repository.schema_paths",
    });
    return finding.file;
  });
}

const registeredSchemaPaths = [
  "schemas/common/v1.schema.json",
  "schemas/hadith/v1.schema.json",
  "schemas/occurrence/v1.schema.json",
  "schemas/section/v1.schema.json",
  "schemas/source/v1.schema.json",
  "schemas/source_witness/v1.schema.json",
];
const rejectedSchemaPaths = [
  "schemas",
  "schemas/.gitkeep",
  "schemas/README.md",
  "schemas/common/v2.schema.json",
  "schemas/relationship/v1.schema.json",
  "schemas/source/V1.schema.json",
  "schemas/source/nested/v1.schema.json",
  "schemas/source/v01.schema.json",
  "schemas/source/v1.json",
  "schemas/source/v1.schema.JSON",
  "schemas/source/v1.schema.json\n",
  "schemas/source/v1.schema.json.bak",
  "schemas/source/v2.schema.json",
  "schemas/Source/v1.schema.json",
  "schemas/source-witness/v1.schema.json",
  "schemas/v1.schema.json",
];

describe("repository and file rules", () => {
  test("accepts canonical schema and core JSON while ignoring unrelated JSON", async () => {
    const snapshot = createRepositorySnapshot([
      { bytes: bytes("{}\n"), path: "schemas/hadith/v1.schema.json" },
      { bytes: bytes("{}\n"), path: "core/hadith/1.json" },
      { bytes: bytes("not JSON"), path: "packages/example/fixture.json" },
    ]);

    expect(await runVerification(snapshot, REPOSITORY_FILE_RULES)).toEqual({
      kind: "complete",
      report: { findings: [], valid: true, verification_version: 2 },
    });
  });

  test("reports every prohibited tracked private path and source format", async () => {
    const snapshot = createRepositorySnapshot([
      { bytes: bytes("private"), path: "AGENTS.md" },
      { bytes: bytes("private"), path: "decisions/notes.md" },
      { bytes: bytes("private"), path: "sources/book.txt" },
      { bytes: bytes("private"), path: "accidental/book.pdf" },
    ]);
    const result = await runVerification(snapshot, REPOSITORY_FILE_RULES);

    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      expect(result.report.findings.map((finding) => finding.file)).toEqual([
        "AGENTS.md",
        "accidental/book.pdf",
        "decisions/notes.md",
        "sources/book.txt",
      ]);
      expect(result.report.findings.every(
        (finding) => finding.rule_id === "repository.private_material_absent",
      )).toBe(true);
    }
  });

  const cases = [
    { bytes: Uint8Array.from([0xff, 0x0a]), ruleId: "file.valid_utf8" },
    {
      bytes: Uint8Array.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d, 0x0a]),
      ruleId: "file.no_bom",
    },
    { bytes: bytes("{}\r\n"), ruleId: "file.lf_only" },
    { bytes: bytes("{}"), ruleId: "file.final_lf" },
    { bytes: bytes("{ invalid }\n"), ruleId: "json.parseable" },
    { bytes: bytes('{"a":1,"a":2}\n'), ruleId: "json.unique_keys" },
    { bytes: bytes('{"b":1,"a":2}\n'), ruleId: "json.canonical" },
    { bytes: bytes('{\n  "text": "\\ud800"\n}\n'), ruleId: "json.canonical" },
    { bytes: bytes('{\n  "text": "أ"\n}\n'), ruleId: "text.nfc" },
  ] as const;

  for (const fixture of cases) {
    test(`maps invalid bytes to ${fixture.ruleId}`, async () => {
      const snapshot = createRepositorySnapshot([
        { bytes: fixture.bytes, path: "core/example.json" },
      ]);
      const result = await runVerification(snapshot, REPOSITORY_FILE_RULES);

      expect(result.kind).toBe("complete");
      if (result.kind === "complete") {
        expect(result.report.findings).toContainEqual(
          expect.objectContaining({ rule_id: fixture.ruleId }),
        );
      }
    });
  }

  test("reports nesting beyond the limit as json.canonical instead of failing", async () => {
    // An object holding MAX_NESTING_DEPTH - 1 nested arrays is canonical at the limit;
    // one more array around its innermost line goes one level beyond it.
    let value: CanonicalJsonValue = [];
    for (let level = 2; level < MAX_NESTING_DEPTH; level += 1) value = [value];
    const atLimit = formatCanonicalJson({ a: value });
    const indent = (depth: number) => "  ".repeat(depth);
    const innermost = `${indent(MAX_NESTING_DEPTH - 1)}[]`;
    const beyond = atLimit.replace(
      innermost,
      `${indent(MAX_NESTING_DEPTH - 1)}[\n${indent(MAX_NESTING_DEPTH)}[]\n${indent(MAX_NESTING_DEPTH - 1)}]`,
    );
    const deep = 200_000;
    const findings = async (source: string) => {
      const snapshot = createRepositorySnapshot([
        { bytes: bytes(source), path: "core/hadith/1.json" },
      ]);
      const result = await runVerification(snapshot, REPOSITORY_FILE_RULES);
      if (result.kind !== "complete") throw new Error("Expected complete verification");
      return result.report.findings;
    };
    const canonical = [{
      file: "core/hadith/1.json",
      instance_path: "",
      message: "JSON bytes are not canonical",
      rule_id: "json.canonical",
    }];

    expect(await findings(atLimit)).toEqual([]);
    expect(await findings(beyond)).toEqual(canonical);
    expect(await findings(`{"a":${"[".repeat(deep)}${"]".repeat(deep)}}\n`)).toEqual(canonical);
  });

  test("collects independent byte failures from one file", async () => {
    const snapshot = createRepositorySnapshot([
      { bytes: bytes('{"a":1,"a":2}\r\n\n'), path: "schemas/common/v1.schema.json" },
    ]);
    const result = await runVerification(snapshot, REPOSITORY_FILE_RULES);

    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      expect(result.report.findings.map((finding) => finding.rule_id)).toEqual([
        "file.final_lf",
        "file.lf_only",
        "json.unique_keys",
      ]);
    }
  });

  test("accepts the five record path shapes at their identifier limits", async () => {
    const snapshot = createRepositorySnapshot(allowedCorePaths.map((path) => ({
      bytes: bytes("not JSON"),
      path,
    })));
    expect(await corePathFindings(snapshot)).toEqual([]);
  });

  test("rejects every other core path regardless of mode or content", async () => {
    const snapshot = createRepositorySnapshot(rejectedCorePaths.map((path, index) => ({
      bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
      mode: index % 2 === 0 ? "100644" : "100755",
      path,
    })));
    expect(await corePathFindings(snapshot)).toEqual(
      snapshot.files.map((file) => file.path),
    );
  });

  test("rejects every ASCII case variant of the core root, even with record paths", async () => {
    const roots = Array.from({ length: 16 }, (_, mask) =>
      [..."core"].map((letter, index) =>
        mask & (1 << index) ? letter.toUpperCase() : letter
      ).join("")
    );
    const variants = roots.filter((root) => root !== "core");
    expect(new Set(variants).size).toBe(15);
    const paths = variants.flatMap((root) => [
      root,
      `${root}/hadith/1.json`,
      `${root}/sources/nawawi-40/source.json`,
      `${root}/sources/nawawi-40/witnesses/nawawi-40-test-2007-4/witness.json`,
    ]);
    const snapshot = createRepositorySnapshot([
      ...paths.map((path, index) => ({
        bytes: bytes("{}\n"),
        mode: index % 4 === 0 ? "160000" : "100644",
        path,
      })),
      { bytes: bytes("{}\n"), path: "core/hadith/1.json" },
      { bytes: bytes("{}\n"), path: "core/sources/nawawi-40/source.json" },
    ]);
    expect(await corePathFindings(snapshot)).toEqual(
      snapshot.files.map((file) => file.path).filter((path) => !path.startsWith("core/")),
    );
  });

  test("leaves similarly prefixed paths outside core to other rules", async () => {
    const snapshot = createRepositorySnapshot([
      "CORE.md",
      "Core-archive/hadith/1.json",
      "core-archive/hadith/2.JSON",
      "corepage.jpg",
      "docs/Core/hadith/1.json",
      "docs/core/scan.png",
      "schemas/hadith/v1.schema.json",
    ].map((path) => ({ bytes: bytes("{}\n"), path })));
    expect(await corePathFindings(snapshot)).toEqual([]);
  });

  test("judges core paths from metadata without reading content", async () => {
    const unreadable = (path: string, mode: string) => ({
      mode,
      path,
      readBytes: (): Uint8Array => {
        throw new Error("content must not be read");
      },
    });
    const snapshot: RepositorySnapshot = {
      files: [
        unreadable("core", "160000"),
        unreadable("core/hadith/1.json", "120000"),
        unreadable("core/hadith/2.JSON", "100644"),
        unreadable("core/sources/example/source.json", "100644"),
      ],
    };
    // file.regular, not this rule, rejects the symlink at an allowed path.
    expect(await corePathFindings(snapshot)).toEqual(["core", "core/hadith/2.JSON"]);
  });

  test("accepts the six registered catalog schema paths", async () => {
    const snapshot = createRepositorySnapshot(registeredSchemaPaths.map((path) => ({
      bytes: bytes("not JSON"),
      path,
    })));
    expect(await schemaPathFindings(snapshot)).toEqual([]);
  });

  test("rejects unregistered versions, entities, and every other schema path", async () => {
    const snapshot = createRepositorySnapshot(rejectedSchemaPaths.map((path, index) => ({
      bytes: bytes("{}\n"),
      mode: index % 2 === 0 ? "100644" : "100755",
      path,
    })));
    expect(await schemaPathFindings(snapshot)).toEqual(
      snapshot.files.map((file) => file.path),
    );
  });

  test("rejects every ASCII case variant of the schemas root, even with catalog paths", async () => {
    const roots = Array.from({ length: 128 }, (_, mask) =>
      [..."schemas"].map((letter, index) =>
        mask & (1 << index) ? letter.toUpperCase() : letter
      ).join("")
    );
    const variants = roots.filter((root) => root !== "schemas");
    expect(new Set(variants).size).toBe(127);
    const paths = variants.flatMap((root) => [
      root,
      `${root}/common/v1.schema.json`,
      `${root}/source/v1.schema.json`,
    ]);
    const snapshot = createRepositorySnapshot([
      ...paths.map((path, index) => ({
        bytes: bytes("{}\n"),
        mode: index % 3 === 0 ? "160000" : "100644",
        path,
      })),
      ...registeredSchemaPaths.map((path) => ({ bytes: bytes("{}\n"), path })),
    ]);
    expect(await schemaPathFindings(snapshot)).toEqual(
      snapshot.files.map((file) => file.path).filter((path) => !path.startsWith("schemas/")),
    );
  });

  test("leaves similarly prefixed paths outside schemas to other rules", async () => {
    const snapshot = createRepositorySnapshot([
      "SCHEMAS.md",
      "core/hadith/1.json",
      "docs/schemas/source/v2.schema.json",
      "packages/core-loader/test/fixtures/schemas/source/v2.schema.json",
      "schemas-archive/source/v1.schema.json",
      "schemas.json",
    ].map((path) => ({ bytes: bytes("{}\n"), path })));
    expect(await schemaPathFindings(snapshot)).toEqual([]);
  });

  test("judges schema paths from metadata without reading content", async () => {
    const unreadable = (path: string, mode: string) => ({
      mode,
      path,
      readBytes: (): Uint8Array => {
        throw new Error("content must not be read");
      },
    });
    const snapshot: RepositorySnapshot = {
      files: [
        unreadable("schemas", "160000"),
        unreadable("schemas/source/v1.schema.json", "120000"),
        unreadable("schemas/source/v2.schema.json", "100644"),
      ],
    };
    // file.regular, not this rule, rejects the symlink at a registered path.
    expect(await schemaPathFindings(snapshot)).toEqual([
      "schemas",
      "schemas/source/v2.schema.json",
    ]);
  });

  test("copies bytes into the repository snapshot", () => {
    const input = bytes("{}\n");
    const snapshot = createRepositorySnapshot([
      { bytes: input, path: "core/example.json" },
    ]);
    input[0] = 0xff;
    const firstRead = snapshot.files[0]?.readBytes();
    if (firstRead !== undefined) {
      firstRead[0] = 0xff;
    }

    expect(snapshot.files[0]?.readBytes()).toEqual(bytes("{}\n"));
  });
});
