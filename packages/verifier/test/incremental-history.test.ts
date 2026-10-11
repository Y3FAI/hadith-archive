import { afterEach, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { formatCanonicalJson } from "@open-hadith/canonical-json";
import { loadGitHistoryState, loadRepositorySnapshotAtCommit } from "@open-hadith/verifier";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dir, "../../..");
const directories: string[] = [];
const sourcePath = "core/sources/example/source.json";
const sourceSchema = "schemas/source/v1.schema.json";
const commonSchema = "schemas/common/v1.schema.json";
const source = (id = "example") => formatCanonicalJson({
  author: "مثال", priority_score: 0, record_type: "source", schema_version: 1,
  source_id: id, title: "مثال",
});

async function fixture(objectFormat = "sha1") {
  const directory = await mkdtemp(resolve(tmpdir(), "open-hadith-history-stream-"));
  directories.push(directory);
  const repository = resolve(directory, "repo");
  await mkdir(repository);
  const git = async (...args: string[]) => (await execFileAsync("git", ["-C", repository, ...args])).stdout.trim();
  const write = async (path: string, value: string | Uint8Array) => {
    await mkdir(dirname(resolve(repository, path)), { recursive: true });
    await writeFile(resolve(repository, path), value);
  };
  const commit = async (message: string) => {
    await git("add", "-A");
    await git("commit", "--quiet", "-m", message);
    return git("rev-parse", "HEAD");
  };
  await git("init", "--quiet", "--initial-branch=main", `--object-format=${objectFormat}`);
  await git("config", "user.name", "History Test");
  await git("config", "user.email", "history@example.invalid");
  await git("config", "commit.gpgsign", "false");
  await cp(resolve(root, "schemas"), resolve(repository, "schemas"), { recursive: true });
  await commit("schemas");
  return { directory, repository, git, write, commit };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("incremental historical verification", () => {
  test("applies same-commit schemas atomically and freezes their first used bytes", async () => {
    const { repository, write, commit } = await fixture();
    const initial = JSON.parse(await readFile(resolve(repository, sourceSchema), "utf8"));
    initial.description = "Unused draft revision";
    await write(sourceSchema, formatCanonicalJson(initial));
    await commit("edit unused schema");
    initial.description = "First used revision";
    const firstUsed = formatCanonicalJson(initial);
    await write(sourceSchema, firstUsed);
    await write(sourcePath, source());
    await commit("admit source together with revised schema");
    const history = await loadGitHistoryState(repository, "HEAD");
    expect(new TextDecoder().decode(history.historicalSchemaBytes.get(sourceSchema))).toBe(firstUsed);
    expect([...history.usedSchemaPaths].sort()).toEqual([commonSchema, sourceSchema]);
    expect(history.historicalSchemaViolationPaths.size).toBe(0);
    expect(history.baseEntityKeys).toContain("source:example");
  });

  test("remembers identity changes, deletions, renames, and maximum numeric IDs after restoration", async () => {
    const { repository, write, commit, git } = await fixture();
    const occurrencePath = "core/sources/example/witnesses/example-edition/occurrences/8.json";
    await write(sourcePath, source());
    await write(occurrencePath, formatCanonicalJson({
      occurrence_id: 8, record_type: "occurrence", schema_version: 1,
    }));
    await commit("identities");
    await write(sourcePath, source("changed"));
    await commit("change identity");
    await write(sourcePath, source());
    await git("rm", occurrencePath);
    await commit("restore source and delete occurrence");
    await git("mv", sourcePath, "core/sources/example/renamed.json");
    await commit("rename source");
    await git("mv", "core/sources/example/renamed.json", sourcePath);
    await commit("restore path");
    const history = await loadGitHistoryState(repository, "HEAD");
    expect(history.greatestOccurrenceId).toBe(8);
    expect(history.baseRecords.map((record) => record.entityKey)).toEqual(["source:example"]);
    expect(history.historicalRecordViolationPaths).toContain(sourcePath);
    expect(history.historicalRecordViolationPaths).toContain(occurrencePath);
    expect(history.historicalRecordViolationPaths).toContain("core/sources/example/renamed.json");
    expect(history.historicalPaths.get("source:changed")).toContain(sourcePath);
    expect(history.historicalPaths.get("source:example")?.size).toBe(2);
  });

  test("remembers indirect schema mutation and restoration without changing records", async () => {
    const { repository, write, commit } = await fixture();
    await write(sourcePath, source());
    await commit("admit");
    const original = await readFile(resolve(repository, commonSchema));
    const modified = JSON.parse(original.toString());
    modified.description = "Changed used dependency";
    await write(commonSchema, formatCanonicalJson(modified));
    await commit("mutate dependency");
    await write(commonSchema, original);
    await commit("restore dependency");
    const history = await loadGitHistoryState(repository, "HEAD");
    expect(history.historicalSchemaViolationPaths).toContain(commonSchema);
    expect(history.historicalSchemaBytes.get(commonSchema)).toEqual(Uint8Array.from(original));
  });

  test("finds new dependencies of a changed used schema", async () => {
    const { repository, write, commit } = await fixture();
    await write(sourcePath, source());
    await commit("admit");
    const schema = JSON.parse(await readFile(resolve(repository, sourceSchema), "utf8"));
    schema.$ref = "../extra/dependency";
    await write(sourceSchema, formatCanonicalJson(schema));
    await write("schemas/extra/dependency", formatCanonicalJson({ type: "object" }));
    await commit("new dependency alongside schema change");
    const history = await loadGitHistoryState(repository, "HEAD");
    expect(history.usedSchemaPaths).toContain("schemas/extra/dependency");
    expect(history.historicalSchemaViolationPaths).toContain(sourceSchema);
  });

  test("fails closed if a still-used schema is removed", async () => {
    const { repository, write, commit, git } = await fixture();
    await write(sourcePath, source());
    await commit("admit");
    await git("rm", commonSchema);
    await commit("remove used dependency");
    await expect(loadGitHistoryState(repository, "HEAD")).rejects.toThrow("Used historical schema is missing");
  });

  test("checks the merge result without parsing malformed topic-branch intermediates", async () => {
    const { repository, write, commit, git } = await fixture();
    await git("switch", "-c", "topic");
    await write(sourcePath, "invalid topic draft\n");
    await commit("draft");
    await write(sourcePath, source());
    await commit("repair draft");
    await git("switch", "main");
    await write("README.md", "parallel work\n");
    await commit("main change");
    await git("merge", "--no-ff", "--quiet", "topic", "-m", "merge reviewed source");
    const history = await loadGitHistoryState(repository, "HEAD");
    expect([...history.baseEntityKeys]).toEqual(["source:example"]);
    expect(history.historicalRecordViolationPaths.size).toBe(0);
    await git("rm", sourcePath);
    await commit("delete merged source");
    expect((await loadGitHistoryState(repository, "HEAD")).historicalRecordViolationPaths).toContain(sourcePath);
  });

  test("includes merge-only edits and respects the requested base", async () => {
    const { repository, write, commit, git } = await fixture();
    const base = await git("rev-parse", "HEAD");
    await git("switch", "-c", "topic");
    await write("notes.md", "topic\n");
    await commit("topic docs");
    await git("switch", "main");
    await git("merge", "--no-ff", "--no-commit", "topic");
    await write(sourcePath, source());
    await commit("merge adds source");
    expect((await loadGitHistoryState(repository, "HEAD")).baseEntityKeys).toContain("source:example");
    expect((await loadGitHistoryState(repository, base)).baseRecords).toHaveLength(0);
  });

  test("supports SHA-256 history and preserves binary snapshot bytes and modes", async () => {
    const { repository, write, commit, git } = await fixture("sha256");
    await write(sourcePath, source());
    const binary = Uint8Array.from([0, 255, 10, 13, 42]);
    await write("docs/tab\tline\n.bin", binary);
    await git("add", ".");
    await git("update-index", "--chmod=+x", sourcePath);
    // Do not restage the executable mode before committing.
    await git("commit", "--quiet", "-m", "records and binary");
    const snapshot = await loadRepositorySnapshotAtCommit(repository, "HEAD");
    expect(snapshot.files.find((file) => file.path === "docs/tab\tline\n.bin")?.readBytes()).toEqual(binary);
    expect(snapshot.files.find((file) => file.path === sourcePath)?.mode).toBe("100755");
    const history = await loadGitHistoryState(repository, "HEAD");
    expect(history.baseCommit).toHaveLength(64);
    expect(history.baseEntityKeys).toContain("source:example");
    await write("docs/unrelated", "extra\n");
    await commit("unrelated");
    expect((await loadGitHistoryState(repository, "HEAD")).baseRecords).toEqual(history.baseRecords);
  });

  test("loads 200 ingestion commits through a bounded number of Git processes", async () => {
    const { directory, repository, write, commit } = await fixture();
    const observations: { commits: number; records: number; processes: number; milliseconds: number }[] = [];
    for (let batch = 1; batch <= 200; batch += 1) {
      for (let offset = 1; offset <= 20; offset += 1) {
        const id = (batch - 1) * 20 + offset;
        await write(`core/sources/example-${id}/source.json`, source(`example-${id}`));
      }
      await commit(`ingest ${batch}`);
      if (batch !== 20 && batch !== 200) continue;
      const trace = resolve(directory, `trace-${batch}.jsonl`);
      const runner = resolve(directory, "measure.ts");
      await writeFile(runner, `
        import { loadGitHistoryState } from ${JSON.stringify(resolve(root, "packages/verifier/src/history.ts"))};
        const start = performance.now();
        const history = await loadGitHistoryState(${JSON.stringify(repository)}, "HEAD");
        console.log(JSON.stringify({ records: history.baseRecords.length, milliseconds: performance.now() - start }));
      `);
      const { stdout } = await execFileAsync(process.execPath, [runner], {
        env: { ...process.env, GIT_TRACE2_EVENT: trace },
      });
      const measured = JSON.parse(stdout) as { records: number; milliseconds: number };
      const commands = (await readFile(trace, "utf8")).trim().split("\n")
        .map((line) => JSON.parse(line) as { event: string; argv?: string[] })
        .filter((entry) => entry.event === "start").map((entry) => entry.argv ?? []);
      expect(measured.records).toBe(batch * 20);
      expect(commands).toHaveLength(4); // rev-parse, merge-base, log, cat-file
      expect(commands.filter((args) => args.includes("cat-file"))).toHaveLength(1);
      expect(commands.some((args) => args.includes("show") || args.includes("ls-tree"))).toBe(false);
      observations.push({ commits: batch, ...measured, processes: commands.length });
    }
    console.info("History scaling:", JSON.stringify(observations));
  }, 60_000);
});
