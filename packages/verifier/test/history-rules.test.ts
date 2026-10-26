import { describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { formatCanonicalJson } from "@open-hadith/canonical-json";
import { EXPECTED_SCHEMA_PATHS } from "@open-hadith/core-loader";
import {
  createHistoryVerificationContext,
  createRepositorySnapshot,
  createStructuralVerificationContext,
  HISTORY_RULES,
  loadGitHistoryState,
  runVerification,
  type GitHistoryState,
  type RepositoryFileInput,
} from "@open-hadith/verifier";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../..");
const encoder = new TextEncoder();
const execFileAsync = promisify(execFile);

async function schemas(): Promise<RepositoryFileInput[]> {
  return Promise.all(EXPECTED_SCHEMA_PATHS.map(async (path) => ({
    bytes: await readFile(resolve(repositoryRoot, "schemas", path)),
    path: `schemas/${path}`,
  })));
}

function input(path: string, value: unknown): RepositoryFileInput {
  return { bytes: encoder.encode(formatCanonicalJson(value as never)), path };
}

function emptyHistory(overrides: Partial<GitHistoryState> = {}): GitHistoryState {
  return {
    baseCommit: "0000000000000000000000000000000000000000",
    baseEntityKeys: new Set(),
    baseRecords: [],
    greatestHadithId: 0,
    greatestOccurrenceId: 0,
    historicalPaths: new Map(),
    historicalRecordViolationPaths: new Set(),
    historicalSchemaBytes: new Map(),
    historicalSchemaViolationPaths: new Set(),
    usedSchemaPaths: new Set(),
    ...overrides,
  };
}

async function verify(
  records: readonly RepositoryFileInput[],
  history: GitHistoryState,
) {
  const snapshot = createRepositorySnapshot([...await schemas(), ...records]);
  const structural = createStructuralVerificationContext(snapshot);
  return runVerification(
    createHistoryVerificationContext(structural, history),
    HISTORY_RULES,
  );
}

function source(path = "core/sources/example/source.json") {
  return input(path, {
    author: "مثال",
    priority_score: 0,
    record_type: "source",
    schema_version: 1,
    source_id: "example",
    title: "مثال",
  });
}

function occurrence(id: number) {
  return input(`core/sources/example/witnesses/example-edition/occurrences/${id}.json`, {
    fingerprint: "0".repeat(64),
    location: { page_end: 1, page_start: 1 },
    occurrence_id: id,
    ordinal: 1,
    raw_text: "مثال",
    record_type: "occurrence",
    schema_version: 1,
    witness_id: "example-edition",
  });
}

function hadith(id: number) {
  return input(`core/hadith/${id}.json`, {
    description: "مثال",
    display_occurrence_id: id,
    hadith_id: id,
    heading: "مثال",
    member_occurrence_ids: [id],
    record_type: "hadith",
    schema_version: 1,
    title: "مثال",
  });
}

describe("Git-history rules", () => {
  test("accepts first numeric identifiers beginning at one", async () => {
    expect(await verify([occurrence(1), hadith(1)], emptyHistory())).toEqual({
      kind: "complete",
      report: { findings: [], valid: true, verification_version: 2 },
    });
  });

  test("protects every historically used schema byte sequence", async () => {
    const path = "schemas/source/v1.schema.json";
    const result = await verify([], emptyHistory({
      historicalSchemaBytes: new Map([[path, Uint8Array.from([0])]]),
      usedSchemaPaths: new Set([path]),
    }));

    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      expect(result.report.findings).toContainEqual(expect.objectContaining({
        file: path,
        rule_id: "history.schema_immutable",
      }));
    }
  });

  test("requires every ever-merged record identity to remain at its path", async () => {
    const result = await verify([], emptyHistory({
      historicalPaths: new Map([["source:example", new Set([
        "core/sources/example/source.json",
      ])]]),
    }));

    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      expect(result.report.findings[0]?.rule_id).toBe("history.record_preserved");
    }
  });

  test("rejects an identifier previously attached to another path", async () => {
    const result = await verify([source("core/sources/reused/source.json")], emptyHistory({
      historicalPaths: new Map([["source:example", new Set([
        "core/sources/example/source.json",
      ])]]),
    }));

    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      expect(result.report.findings).toContainEqual(expect.objectContaining({
        rule_id: "history.identifier_not_reused",
      }));
    }
  });

  test("requires new numeric identifiers to follow the historical maximum", async () => {
    const result = await verify([occurrence(4), hadith(4)], emptyHistory({
      greatestHadithId: 2,
      greatestOccurrenceId: 2,
    }));

    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      expect(result.report.findings.filter(
        (finding) => finding.rule_id === "history.sequence_next",
      )).toHaveLength(2);
    }
  });

  test("resolves and indexes the explicit real-repository base", async () => {
    const history = await loadGitHistoryState(repositoryRoot, "HEAD^");
    expect(history.baseCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(history.greatestHadithId).toBe(0);
    expect(history.greatestOccurrenceId).toBe(0);
  });

  test("remembers historical deletion and schema mutation after restoration", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "open-hadith-history-"));
    try {
      await execFileAsync("git", ["init", "--quiet"], { cwd: directory });
      await execFileAsync("git", ["config", "user.name", "Verifier Test"], {
        cwd: directory,
      });
      await execFileAsync("git", ["config", "user.email", "verifier@example.invalid"], {
        cwd: directory,
      });
      await execFileAsync("git", ["config", "commit.gpgsign", "false"], {
        cwd: directory,
      });
      await mkdir(resolve(directory, "schemas/source"), { recursive: true });
      await mkdir(resolve(directory, "core/sources/example"), { recursive: true });
      const schemaPath = resolve(directory, "schemas/source/v1.schema.json");
      const originalSchema = formatCanonicalJson({ type: "object" });
      const recordPath = resolve(directory, "core/sources/example/source.json");
      const recordSource = formatCanonicalJson({
        record_type: "source",
        schema_version: 1,
        source_id: "example",
      });
      await writeFile(schemaPath, originalSchema, "utf8");
      await writeFile(recordPath, recordSource, "utf8");
      await execFileAsync("git", ["add", "core", "schemas"], { cwd: directory });
      await execFileAsync("git", ["commit", "--quiet", "-m", "add data"], {
        cwd: directory,
      });

      await rm(recordPath);
      await execFileAsync("git", ["add", "-A", "core"], { cwd: directory });
      await execFileAsync("git", ["commit", "--quiet", "-m", "delete data"], {
        cwd: directory,
      });
      await writeFile(recordPath, recordSource, "utf8");
      await execFileAsync("git", ["add", "core"], { cwd: directory });
      await execFileAsync("git", ["commit", "--quiet", "-m", "restore data"], {
        cwd: directory,
      });

      await writeFile(schemaPath, formatCanonicalJson({ type: "string" }), "utf8");
      await execFileAsync("git", ["add", "schemas"], { cwd: directory });
      await execFileAsync("git", ["commit", "--quiet", "-m", "mutate schema"], {
        cwd: directory,
      });

      await writeFile(schemaPath, originalSchema, "utf8");
      await execFileAsync("git", ["add", "schemas"], { cwd: directory });
      await execFileAsync("git", ["commit", "--quiet", "-m", "restore schema"], {
        cwd: directory,
      });

      const history = await loadGitHistoryState(directory, "HEAD");
      expect(history.historicalSchemaViolationPaths).toContain(
        "schemas/source/v1.schema.json",
      );
      expect(history.historicalRecordViolationPaths).toContain(
        "core/sources/example/source.json",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
