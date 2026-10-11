import { afterEach, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { formatCanonicalJson } from "@open-hadith/canonical-json";
import {
  loadRepositorySnapshot,
  presentVerificationResult,
  verifyRepository,
} from "@open-hadith/verifier";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dir, "../../..");
const temporaryDirectories: string[] = [];
const sourcePath = "core/sources/example/source.json";
const sourceBytes = formatCanonicalJson({
  author: "مثال",
  priority_score: 0,
  record_type: "source",
  schema_version: 1,
  source_id: "example",
  title: "مثال",
});

async function fixture() {
  const directory = await mkdtemp(resolve(tmpdir(), "open-hadith-index-"));
  temporaryDirectories.push(directory);
  const root = resolve(directory, "repository");
  await mkdir(root);
  const git = async (...args: string[]) => {
    const { stdout } = await execFileAsync("git", ["-C", root, ...args]);
    return stdout.trim();
  };
  const write = async (path: string, bytes: string | Uint8Array) => {
    const absolute = resolve(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes);
  };
  await git("init", "--quiet");
  await git("config", "user.name", "Verifier Test");
  await git("config", "user.email", "verifier@example.invalid");
  await git("config", "commit.gpgsign", "false");
  await cp(resolve(repositoryRoot, "schemas"), resolve(root, "schemas"), { recursive: true });
  await git("add", ".");
  await git("commit", "--quiet", "-m", "schemas");
  const base = await git("rev-parse", "HEAD");
  return { base, directory, git, root, write };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function expectRegularFinding(root: string, base: string, path: string) {
  const result = await verifyRepository(root, base);
  expect(result.kind).toBe("complete");
  if (result.kind !== "complete") throw new Error("Expected a content failure");
  expect(result.report.valid).toBe(false);
  expect(result.report.findings).toContainEqual({
    file: path,
    instance_path: "",
    message: "Core and schema paths must be regular Git files",
    rule_id: "file.regular",
  });
  const io = { stderr: { write() {} }, stdout: { write() {} } };
  expect(presentVerificationResult(result, io)).toBe(1);
}

describe("staged repository verification", () => {
  test("uses staged bytes despite unstaged edits, replacements, and missing working files", async () => {
    const { base, directory, git, root, write } = await fixture();
    await write(sourcePath, sourceBytes);
    await git("add", "core");
    await write(sourcePath, "invalid unstaged JSON");
    expect((await loadRepositorySnapshot(root)).files.find((file) =>
      file.path === sourcePath
    )?.readBytes()).toEqual(new TextEncoder().encode(sourceBytes));
    await rm(resolve(root, sourcePath));
    await symlink(resolve(directory, "missing-target"), resolve(root, sourcePath));
    expect(await verifyRepository(root, base)).toMatchObject({
      kind: "complete", report: { valid: true },
    });
    await rm(resolve(root, sourcePath));
    expect(await verifyRepository(root, base)).toMatchObject({
      kind: "complete", report: { valid: true },
    });
  });

  test("does not let a valid unstaged repair hide invalid staged JSON", async () => {
    const { base, git, root, write } = await fixture();
    await write(sourcePath, "invalid staged JSON\n");
    await git("add", "core");
    await write(sourcePath, sourceBytes);
    const result = await verifyRepository(root, base);
    expect(result).toMatchObject({ kind: "complete", report: { valid: false } });
    if (result.kind === "complete") {
      expect(result.report.findings).toContainEqual(expect.objectContaining({
        file: sourcePath, rule_id: "json.parseable",
      }));
    }
    await git("add", "core");
    expect(await verifyRepository(root, base)).toMatchObject({
      kind: "complete", report: { valid: true },
    });
  });

  test("rejects an external symlink even when its target is valid or absent", async () => {
    const { base, directory, git, root } = await fixture();
    const target = resolve(directory, "outside.json");
    await writeFile(target, sourceBytes);
    await mkdir(dirname(resolve(root, sourcePath)), { recursive: true });
    await symlink(target, resolve(root, sourcePath));
    await git("add", "core");
    await expectRegularFinding(root, base, sourcePath);
    await rm(target);
    await expectRegularFinding(root, base, sourcePath);
    // Replacing only the working file must not conceal the staged symlink.
    await rm(resolve(root, sourcePath));
    await writeFile(resolve(root, sourcePath), sourceBytes);
    await expectRegularFinding(root, base, sourcePath);
  });

  test("rejects a schema symlink without attempting to load its target", async () => {
    const { base, directory, git, root } = await fixture();
    const path = "schemas/source/v1.schema.json";
    await rm(resolve(root, path));
    await symlink(resolve(directory, "missing-schema"), resolve(root, path));
    await git("add", "schemas");
    await expectRegularFinding(root, base, path);
  });

  for (const path of ["core", "core/vendor", "schemas", "schemas/vendor"]) {
    test(`rejects a submodule at ${path} with a content finding`, async () => {
      const { base, git, root } = await fixture();
      if (path === "schemas") await git("rm", "-r", "--cached", "schemas");
      await git("update-index", "--add", "--cacheinfo", `160000,${base},${path}`);
      await expectRegularFinding(root, base, path);
    });
  }

  test("accepts executable regular records and unrelated non-regular entries", async () => {
    const { base, git, root, write } = await fixture();
    await write(sourcePath, sourceBytes);
    await git("add", "core");
    await git("update-index", "--chmod=+x", sourcePath);
    await symlink("missing-document", resolve(root, "reference"));
    await git("add", "reference");
    await git("update-index", "--add", "--cacheinfo", `160000,${base},vendor`);
    expect(await verifyRepository(root, base)).toMatchObject({
      kind: "complete", report: { valid: true },
    });
  });

  test("reads binary blobs, repeated blobs, and unusual paths without losing framing", async () => {
    const { git, root, write } = await fixture();
    const bytes = Uint8Array.from([0, 0xff, 0x0a, 0x0d, 42]);
    const paths = ["docs/space tab\tnewline\n.bin", "docs/copy.bin", "docs/empty"];
    await write(paths[0]!, bytes);
    await write(paths[1]!, bytes);
    await write(paths[2]!, "");
    await git("add", "docs");
    const files = (await loadRepositorySnapshot(root)).files;
    expect(files.find((file) => file.path === paths[0])?.readBytes()).toEqual(bytes);
    expect(files.find((file) => file.path === paths[1])?.readBytes()).toEqual(bytes);
    expect(files.find((file) => file.path === paths[2])?.readBytes()).toEqual(new Uint8Array());
  });

  test("uses staged deletions even if an untracked copy remains on disk", async () => {
    const { git, root, write } = await fixture();
    await write(sourcePath, sourceBytes);
    await git("add", "core");
    await git("commit", "--quiet", "-m", "source");
    const base = await git("rev-parse", "HEAD");
    await git("rm", "--cached", sourcePath);
    const result = await verifyRepository(root, base);
    expect(result).toMatchObject({ kind: "complete", report: { valid: false } });
    if (result.kind === "complete") {
      expect(result.report.findings).toContainEqual(expect.objectContaining({
        file: sourcePath, rule_id: "history.record_preserved",
      }));
    }
  });

  test("fails closed on unresolved index entries", async () => {
    const { git, root, write } = await fixture();
    await write(sourcePath, sourceBytes);
    await git("add", "core");
    const objectId = await git("rev-parse", `:${sourcePath}`);
    const child = Bun.spawn(["git", "-C", root, "update-index", "--index-info"], {
      stdin: new Blob([
        `0 ${"0".repeat(objectId.length)}\t${sourcePath}\n`,
        `100644 ${objectId} 1\t${sourcePath}\n`,
        `100644 ${objectId} 2\t${sourcePath}\n`,
        `100644 ${objectId} 3\t${sourcePath}\n`,
      ]),
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await child.exited).toBe(0);
    expect(await verifyRepository(root, "HEAD")).toMatchObject({
      kind: "incomplete", error: { code: "repository_unavailable" },
    });
  });
});
