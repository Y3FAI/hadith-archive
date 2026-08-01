import { describe, expect, test } from "bun:test";

import {
  createRepositorySnapshot,
  REPOSITORY_FILE_RULES,
  runVerification,
} from "@open-hadith/verifier";

const encoder = new TextEncoder();
const bytes = (source: string): Uint8Array => encoder.encode(source);

describe("repository and file rules", () => {
  test("accepts canonical schema and core JSON while ignoring unrelated JSON", async () => {
    const snapshot = createRepositorySnapshot([
      { bytes: bytes("{}\n"), path: "schemas/example/v1.schema.json" },
      { bytes: bytes("{}\n"), path: "core/hadith/1.json" },
      { bytes: bytes("not JSON"), path: "packages/example/fixture.json" },
    ]);

    expect(await runVerification(snapshot, REPOSITORY_FILE_RULES)).toEqual({
      kind: "complete",
      report: { findings: [], valid: true, verification_version: 1 },
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

  test("collects independent byte failures from one file", async () => {
    const snapshot = createRepositorySnapshot([
      { bytes: bytes('{"a":1,"a":2}\r\n\n'), path: "schemas/example.json" },
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
