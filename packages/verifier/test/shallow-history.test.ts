import { afterEach, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { formatCanonicalJson } from "@open-hadith/canonical-json";

import {
  assertCompleteGitHistory,
  loadGitHistoryState,
  SHALLOW_REPOSITORY_MESSAGE,
  ShallowRepositoryError,
} from "../src/history.ts";
import { verifyRepository } from "../src/verify.ts";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dir, "../../..");
const directories: string[] = [];
const removedPath = "core/sources/removed/source.json";

const git = async (root: string, ...args: string[]) =>
  (await execFileAsync("git", ["-C", root, ...args])).stdout.trim();

function source(sourceId: string) {
  return formatCanonicalJson({
    author: "مثال", priority_score: 0, record_type: "source", schema_version: 1,
    source_id: sourceId, title: "مثال",
  });
}

async function linkDependencies(root: string) {
  await symlink(resolve(projectRoot, "node_modules"), resolve(root, "node_modules"), "dir");
  await symlink(resolve(projectRoot, "packages/verifier/node_modules"), resolve(root, "packages/verifier/node_modules"), "dir");
}

// Accepted history merges a record, deletes it, then makes an unrelated change.
// Only the full history reveals the deletion.
async function origin() {
  const directory = await mkdtemp(resolve(tmpdir(), "open-hadith-shallow-"));
  directories.push(directory);
  const root = resolve(directory, "origin");
  const write = async (path: string, contents: string) => {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), contents);
  };
  const commit = async (message: string) => {
    await git(root, "add", "-A");
    await git(root, "commit", "--quiet", "-m", message);
  };
  await mkdir(root);
  await git(root, "init", "--quiet", "--initial-branch=main");
  await git(root, "config", "user.name", "Shallow Test");
  await git(root, "config", "user.email", "shallow@example.invalid");
  await git(root, "config", "commit.gpgsign", "false");
  await cp(resolve(projectRoot, "schemas"), resolve(root, "schemas"), { recursive: true });
  await cp(resolve(projectRoot, "packages/verifier/src"), resolve(root, "packages/verifier/src"), { recursive: true });
  await cp(resolve(projectRoot, "packages/verifier/package.json"), resolve(root, "packages/verifier/package.json"));
  await cp(resolve(projectRoot, "package.json"), resolve(root, "package.json"));
  await write(".gitignore", "node_modules\n");
  await write("core/sources/example/source.json", source("example"));
  await write(removedPath, source("removed"));
  await commit("accept records");
  await rm(resolve(root, removedPath));
  await commit("delete merged record");
  await write("notes.md", "unrelated\n");
  await commit("notes");

  const clone = async (name: string, ...options: string[]) => {
    const target = resolve(directory, name);
    await execFileAsync("git", ["clone", "--quiet", ...options, `file://${root}`, target]);
    await linkDependencies(target);
    return target;
  };
  return { directory, clone };
}

// Invoke the clone's own verifier entrypoint so stderr holds only its output.
async function verifyCli(root: string, base: string) {
  const child = Bun.spawn([process.execPath, "packages/verifier/src/main.ts", "--base", base], {
    cwd: root, stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function expectShallowRejection(root: string, base: string) {
  await expect(loadGitHistoryState(root, base)).rejects.toBeInstanceOf(ShallowRepositoryError);
  expect(await verifyRepository(root, base)).toEqual({
    error: { code: "history_unavailable", message: SHALLOW_REPOSITORY_MESSAGE },
    kind: "incomplete",
  });
  const cli = await verifyCli(root, base);
  expect(cli).toEqual({ exitCode: 2, stdout: "", stderr: `${SHALLOW_REPOSITORY_MESSAGE}\n` });
}

async function expectDeletionReported(root: string, base: string) {
  const deletion = expect.objectContaining({ rule_id: "history.record_preserved", file: removedPath });
  const result = await verifyRepository(root, base);
  if (result.kind !== "complete") throw new Error("Expected a complete verification");
  expect(result.report.valid).toBe(false);
  expect(result.report.findings).toContainEqual(deletion);
  const cli = await verifyCli(root, base);
  expect(cli.exitCode).toBe(1);
  expect(cli.stderr).toBe("");
  const report = JSON.parse(cli.stdout);
  expect(report.valid).toBe(false);
  expect(report.findings).toContainEqual(deletion);
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("rejects a shallow clone whose resolvable base hides a historical deletion", async () => {
  const { clone } = await origin();
  const shallow = await clone("shallow", "--depth", "2");
  // The base is present in the shallow clone, so only the shallow check stops
  // the truncated walk from reporting valid:true.
  expect(await git(shallow, "rev-parse", "--is-shallow-repository")).toBe("true");
  await git(shallow, "rev-parse", "--verify", "HEAD^^{commit}");
  await expectShallowRejection(shallow, "HEAD^");

  await git(shallow, "fetch", "--quiet", "--unshallow");
  await expectDeletionReported(shallow, "HEAD^");
}, 30_000);

test("rejects a depth 1 clone and its linked worktrees", async () => {
  const { directory, clone } = await origin();
  const shallow = await clone("shallow", "--depth", "1");
  await expectShallowRejection(shallow, "HEAD");
  const worktree = resolve(directory, "worktree");
  await git(shallow, "worktree", "add", "--quiet", "--detach", worktree, "HEAD");
  await expect(loadGitHistoryState(worktree, "HEAD")).rejects.toBeInstanceOf(ShallowRepositoryError);
}, 30_000);

test("a complete clone still reports the historical deletion", async () => {
  const { clone } = await origin();
  const complete = await clone("complete");
  expect(await git(complete, "rev-parse", "--is-shallow-repository")).toBe("false");
  await expectDeletionReported(complete, "HEAD^");
  await expectDeletionReported(complete, "HEAD");
}, 30_000);

test("fails closed without the shallow-clone message when Git cannot answer", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "open-hadith-not-git-"));
  directories.push(directory);
  const failure = await assertCompleteGitHistory(directory).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(Error);
  expect(failure).not.toBeInstanceOf(ShallowRepositoryError);
});
