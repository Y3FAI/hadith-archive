import { afterEach, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { formatCanonicalJson } from "@open-hadith/canonical-json";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dir, "../../..");
const directories: string[] = [];
const sourcePath = "core/sources/example/source.json";
const witnessPath = "core/sources/example/witnesses/example-edition/witness.json";

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "open-hadith-base-"));
  directories.push(root);
  const git = async (...args: string[]) => (await execFileAsync("git", ["-C", root, ...args])).stdout.trim();
  const write = async (path: string, contents: string) => {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), contents);
  };
  const commit = async (message: string) => {
    await git("add", "-A");
    await git("commit", "--quiet", "-m", message);
    return git("rev-parse", "HEAD");
  };
  await git("init", "--quiet", "--initial-branch=main");
  await git("config", "user.name", "Base Test");
  await git("config", "user.email", "base@example.invalid");
  await git("config", "commit.gpgsign", "false");
  await cp(resolve(projectRoot, "schemas"), resolve(root, "schemas"), { recursive: true });
  await cp(resolve(projectRoot, "packages/verifier/src"), resolve(root, "packages/verifier/src"), { recursive: true });
  await cp(resolve(projectRoot, "packages/verifier/package.json"), resolve(root, "packages/verifier/package.json"));
  await cp(resolve(projectRoot, "package.json"), resolve(root, "package.json"));
  await symlink(resolve(projectRoot, "node_modules"), resolve(root, "node_modules"), "dir");
  await symlink(resolve(projectRoot, "packages/verifier/node_modules"), resolve(root, "packages/verifier/node_modules"), "dir");
  await write(".gitignore", "node_modules\n");
  await write(sourcePath, formatCanonicalJson({
    author: "مثال", priority_score: 0, record_type: "source", schema_version: 1,
    source_id: "example", title: "مثال",
  }));
  await write(witnessPath, formatCanonicalJson({
    edition_statement: "الطبعة الأولى", isbn: "9780000000002", priority_score: 0,
    publication_year: 2007, publisher: "مثال", record_type: "source_witness",
    reference_scheme: { hadith_number: true, volume: false }, schema_version: 1,
    source_id: "example", title_as_printed: "مثال", witness_id: "example-edition",
  }));
  const base = await commit("accepted records");
  await git("switch", "--quiet", "-c", "feature");
  return { root, git, write, commit, base };
}

async function run(root: string, ...args: string[]) {
  const child = Bun.spawn([process.execPath, "run", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("the package verify command requires a base instead of silently using HEAD's parent", async () => {
  const { root, base } = await fixture();
  const missing = await run(root, "verify");
  expect(missing).toMatchObject({ exitCode: 2 });
  expect(missing.stdout).toBe("");
  expect(missing.stderr).toContain("Usage: verifier --base <git-reference>");
  const explicit = await run(root, "verify", "--base", base);
  expect(explicit.exitCode).toBe(0);
  expect(JSON.parse(explicit.stdout).valid).toBe(true);
  const packageRoot = resolve(root, "packages/verifier");
  expect((await run(packageRoot, "verify")).exitCode).toBe(2);
  expect((await run(packageRoot, "verify", "--base", base)).exitCode).toBe(0);
});

test("check forwards its explicit base to verification and rejects a missing base", async () => {
  const { root, base } = await fixture();
  const packagePath = resolve(root, "package.json");
  const manifest = JSON.parse(await readFile(packagePath, "utf8"));
  // Exercise the real check chain and verifier without recursively running the
  // suite inside this fixture. Only the preceding toolchain steps are stubbed.
  for (const step of ["typecheck", "test", "check:generated", "verify:schemas"]) {
    manifest.scripts[step] = "bun -e 'process.exit(0)'";
  }
  await writeFile(packagePath, JSON.stringify(manifest));
  const explicit = await run(root, "check", "--base", base);
  expect(explicit.exitCode).toBe(0);
  expect(JSON.parse(explicit.stdout).valid).toBe(true);
  const missing = await run(root, "check");
  expect(missing.exitCode).toBe(2);
  expect(missing.stdout).toBe("");
  expect(missing.stderr).toContain("Usage: verifier --base <git-reference>");
});

test("rejects a gapped identifier introduced before the final feature-branch commit", async () => {
  const { root, git, write, commit, base } = await fixture();
  const rawText = "مثال";
  await write("core/sources/example/witnesses/example-edition/occurrences/500.json", formatCanonicalJson({
    fingerprint: createHash("sha256").update(rawText).digest("hex"),
    location: { hadith_number: 1, page_end: 1, page_start: 1 }, occurrence_id: 500,
    ordinal: 1, raw_text: rawText, record_type: "occurrence", schema_version: 1,
    witness_id: "example-edition",
  }));
  await commit("mint 500 instead of 1");
  await write("notes.md", "unrelated second commit\n");
  await commit("notes");
  // Reproduce the former false pass, then exercise the documented base policy.
  expect((await run(root, "verify", "--base", "HEAD^")).exitCode).toBe(0);
  const acceptedBase = await git("merge-base", "main", "HEAD");
  expect(acceptedBase).toBe(base);
  const checked = await run(root, "verify", "--base", acceptedBase);
  expect(checked.exitCode).toBe(1);
  expect(JSON.parse(checked.stdout).findings).toContainEqual(expect.objectContaining({
    rule_id: "history.sequence_next", instance_path: "/occurrence_id",
  }));
});

test("ignores repaired draft commits when verifying against accepted target history", async () => {
  const { root, git, write, commit, base } = await fixture();
  const original = await readFile(resolve(root, sourcePath), "utf8");
  await write(sourcePath, "broken draft JSON\n");
  await commit("draft");
  await write(sourcePath, original);
  await commit("repair draft");
  await write("notes.md", "unrelated follow-up\n");
  await commit("notes");
  expect((await run(root, "verify", "--base", "HEAD^")).exitCode).toBe(2);
  expect(await git("merge-base", "main", "HEAD")).toBe(base);
  const checked = await run(root, "verify", "--base", base);
  expect(checked.exitCode).toBe(0);
  expect(JSON.parse(checked.stdout).valid).toBe(true);
});
