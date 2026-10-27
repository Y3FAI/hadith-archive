import { afterEach, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
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

async function fixture(objectFormat: "sha1" | "sha256" = "sha1") {
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
  await git("init", "--quiet", `--object-format=${objectFormat}`);
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
  test("reads original staged bytes despite local Git replacement refs", async () => {
    const { base, git, root, write } = await fixture();
    const invalid = "invalid staged JSON\n";
    await write(sourcePath, invalid);
    await git("add", "core");
    const originalId = await git("rev-parse", `:${sourcePath}`);
    await write("replacement.json", sourceBytes);
    const replacementId = await git("hash-object", "-w", "replacement.json");
    await git("replace", originalId, replacementId);
    // Git would normally substitute the valid blob; verification must not.
    expect(await git("cat-file", "blob", originalId)).toBe(sourceBytes.trim());
    const files = (await loadRepositorySnapshot(root)).files;
    expect(files.find((file) => file.path === sourcePath)?.readBytes()).toEqual(
      new TextEncoder().encode(invalid),
    );
    const result = await verifyRepository(root, base);
    expect(result).toMatchObject({ kind: "complete", report: { valid: false } });
    if (result.kind === "complete") {
      expect(result.report.findings).toContainEqual(expect.objectContaining({
        file: sourcePath, rule_id: "json.parseable",
      }));
    }
  });

  for (const objectFormat of ["sha1", "sha256"] as const) {
    test(`excludes intent-to-add drafts but rejects staged empty JSON (${objectFormat})`, async () => {
      const { base, git, root, write } = await fixture(objectFormat);
      await write(sourcePath, sourceBytes);
      await git("add", "-N", "core");
      expect(await git("diff", "--cached", "--name-only")).toBe("");
      const snapshot = await loadRepositorySnapshot(root);
      expect(snapshot.files.some((file) => file.path === sourcePath)).toBe(false);
      // Unchanged committed files must still be part of the candidate.
      expect(snapshot.files.some((file) => file.path === "schemas/common/v1.schema.json")).toBe(true);
      expect(await verifyRepository(root, base)).toMatchObject({
        kind: "complete", report: { valid: true },
      });
      await write(sourcePath, "");
      await git("add", "core");
      const staged = await loadRepositorySnapshot(root);
      expect(staged.files.find((file) => file.path === sourcePath)?.readBytes()).toEqual(new Uint8Array());
      const result = await verifyRepository(root, base);
      expect(result).toMatchObject({ kind: "complete", report: { valid: false } });
      if (result.kind === "complete") {
        expect(result.report.findings).toContainEqual(expect.objectContaining({
          file: sourcePath, rule_id: "json.parseable",
        }));
      }
    });
  }

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

  test("rejects staged bidi controls without repairing the staged text", async () => {
    const { base, git, root, write } = await fixture();
    const override = String.fromCodePoint(0x202e);
    const polluted = sourceBytes.replace('"title": "مثال"', `"title": "مث${override}ال"`);
    expect(polluted).not.toBe(sourceBytes);
    await write(sourcePath, polluted);
    await git("add", "core");
    const result = await verifyRepository(root, base);
    expect(result).toMatchObject({ kind: "complete", report: { valid: false } });
    if (result.kind === "complete") {
      expect(result.report.findings).toEqual([expect.objectContaining({
        file: sourcePath, instance_path: "/title", rule_id: "text.single_line",
      })]);
    }
    expect((await loadRepositorySnapshot(root)).files.find((file) =>
      file.path === sourcePath
    )?.readBytes()).toEqual(new TextEncoder().encode(polluted));
  });

  test("rejects staged non-record core files without changing indexed bytes", async () => {
    const { base, git, root, write } = await fixture();
    const witness = "core/sources/example/witnesses/example-edition";
    const strays = new Map<string, string | Uint8Array>([
      ["core/hadith/2.JSON", sourceBytes],
      ["core/hadith/3.json.bak", "not json {{{"],
      [`${witness}/page-010.jpg`, Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00])],
      [`${witness}/scan-010.tif`, Uint8Array.from([0x49, 0x49, 0x2a, 0x00])],
    ]);
    await write(sourcePath, sourceBytes);
    for (const [path, bytes] of strays) await write(path, bytes);
    await git("add", "core");
    const indexed = async () => (await loadRepositorySnapshot(root)).files
      .map((file) => [file.path, file.mode, [...file.readBytes()]]);
    const before = await indexed();
    const result = await verifyRepository(root, base);
    expect(result).toMatchObject({ kind: "complete", report: { valid: false } });
    if (result.kind === "complete") {
      expect(result.report.findings).toEqual([...strays.keys()].sort().map((file) => ({
        file,
        instance_path: "",
        message: "Core paths must match an approved record path",
        rule_id: "repository.core_paths",
      })));
    }
    expect(await indexed()).toEqual(before);
  });

  for (const root of ["Core", "CORE"]) {
    test(`rejects a staged ${root} root alias of a valid record path`, async () => {
      const { base, git, root: repository, write } = await fixture();
      const aliasPath = sourcePath.replace(/^core\//, `${root}/`);
      await write(aliasPath, sourceBytes);
      await git("add", root);
      expect(await git("ls-files")).toContain(aliasPath);
      const coreFinding = (file: string) => ({
        file,
        instance_path: "",
        message: "Core paths must match an approved record path",
        rule_id: "repository.core_paths",
      });
      expect(await verifyRepository(repository, base)).toEqual({
        kind: "complete",
        report: { findings: [coreFinding(aliasPath)], valid: false, verification_version: 2 },
      });
      await git("rm", "--quiet", "-r", "--cached", root);
      await git("update-index", "--add", "--cacheinfo", `160000,${base},${root}`);
      expect(await verifyRepository(repository, base)).toEqual({
        kind: "complete",
        report: { findings: [coreFinding(root)], valid: false, verification_version: 2 },
      });
    });
  }

  test("rejects staged unregistered schemas, even well formed, without changing indexed bytes", async () => {
    const { base, git, root, write } = await fixture();
    const namespace = "https://raw.githubusercontent.com/Y3FAI/open-hadith/main/schemas";
    const strays = new Map<string, string>([
      // The reproduction from #42: a well-shaped version path with an invalid $id and type.
      ["schemas/source/v2.schema.json", formatCanonicalJson({
        $id: "wrong",
        type: "not-a-json-schema-type",
      })],
      ["schemas/relationship/v1.schema.json", formatCanonicalJson({
        $id: `${namespace}/relationship/v1.schema.json`,
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
      })],
    ]);
    for (const [path, bytes] of strays) await write(path, bytes);
    await git("add", "schemas");
    // A case-insensitive filesystem cannot hold Schemas/ beside schemas/, so the
    // alias enters the index directly with the bytes of a registered schema.
    const alias = "Schemas/source/v1.schema.json";
    const blob = await git("rev-parse", ":schemas/source/v1.schema.json");
    await git("update-index", "--add", "--cacheinfo", `100644,${blob},${alias}`);
    expect(await git("ls-files")).toContain(alias);
    const indexed = async () => (await loadRepositorySnapshot(root)).files
      .map((file) => [file.path, file.mode, [...file.readBytes()]]);
    const before = await indexed();
    expect(await verifyRepository(root, base)).toEqual({
      kind: "complete",
      report: {
        findings: [alias, ...strays.keys()].sort().map((file) => ({
          file,
          instance_path: "",
          message: "Schema paths must match a registered catalog schema",
          rule_id: "repository.schema_paths",
        })),
        valid: false,
        verification_version: 2,
      },
    });
    expect(await indexed()).toEqual(before);
  });

  test("rejects an external symlink even when its target is valid or absent", async () => {
    const { base, directory, git, root } = await fixture();
    const target = resolve(directory, "outside.json");
    await writeFile(target, sourceBytes);
    await mkdir(dirname(resolve(root, sourcePath)), { recursive: true });
    await symlink(target, resolve(root, sourcePath));
    await git("add", "core");
    await expectRegularFinding(root, base, sourcePath);
    // The allowed-looking path itself needs no core path finding.
    expect(await verifyRepository(root, base)).toMatchObject({
      report: { findings: [expect.objectContaining({ rule_id: "file.regular" })] },
    });
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
      await git("config", "diff.ignoreSubmodules", "all");
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

  test("regroups occurrences through hadith records alone and rejects invalid membership", async () => {
    const { base, git, root, write } = await fixture();
    const witnessDirectory = "core/sources/example/witnesses/example-edition";
    const occurrencePath = (id: number) => `${witnessDirectory}/occurrences/${id}.json`;
    const rawText = "عنوان حديث كامل";
    const occurrence = (id: number, extra: Record<string, unknown> = {}) => formatCanonicalJson({
      fingerprint: createHash("sha256").update(rawText, "utf8").digest("hex"),
      location: { hadith_number: id, page_end: 10, page_start: 10 },
      occurrence_id: id,
      ordinal: id,
      raw_text: rawText,
      record_type: "occurrence",
      schema_version: 1,
      witness_id: "example-edition",
      ...extra,
    });
    const hadith = (id: number, members: number[], display = members[0]) => formatCanonicalJson({
      description: "كامل",
      display_occurrence_id: display as number,
      hadith_id: id,
      heading: "حديث",
      member_occurrence_ids: members,
      record_type: "hadith",
      schema_version: 1,
      title: "عنوان",
    });
    const findings = async (accepted: string) => {
      const result = await verifyRepository(root, accepted);
      if (result.kind !== "complete") throw new Error("Expected complete verification");
      return result.report.findings.map((item) => `${item.file} ${item.rule_id} ${item.instance_path}`);
    };

    await write(sourcePath, sourceBytes);
    await write(`${witnessDirectory}/witness.json`, formatCanonicalJson({
      edition_statement: "الطبعة الأولى",
      isbn: "9780000000002",
      priority_score: 0,
      publication_year: 2007,
      publisher: "مثال",
      record_type: "source_witness",
      reference_scheme: { hadith_number: true, volume: false },
      schema_version: 1,
      source_id: "example",
      title_as_printed: "مثال",
      witness_id: "example-edition",
    }));
    for (const id of [1, 2, 3]) await write(occurrencePath(id), occurrence(id));
    await write("core/hadith/1.json", hadith(1, [1]));
    await git("add", "core");
    expect(await findings(base)).toEqual([]);
    await git("commit", "--quiet", "-m", "grouped core");
    const accepted = await git("rev-parse", "HEAD");
    const occurrenceBlobs = async () => Promise.all(
      [1, 2, 3].map((id) => git("rev-parse", `:${occurrencePath(id)}`)),
    );
    const committedBlobs = await occurrenceBlobs();

    // Regrouping touches only hadith records; numeric order is not lexicographic.
    await write("core/hadith/1.json", hadith(1, [1, 3], 3));
    await write("core/hadith/2.json", hadith(2, [2]));
    await git("add", "core");
    expect(await findings(accepted)).toEqual([]);
    expect((await git("diff", "--cached", "--name-only")).split("\n")).toEqual([
      "core/hadith/1.json",
      "core/hadith/2.json",
    ]);
    expect(await occurrenceBlobs()).toEqual(committedBlobs);

    await write("core/hadith/2.json", hadith(2, [2, 3]));
    await git("add", "core");
    expect(await findings(accepted)).toEqual([
      "core/hadith/1.json hadith.member_exclusive /member_occurrence_ids/1",
      "core/hadith/2.json hadith.member_exclusive /member_occurrence_ids/1",
    ]);

    await write("core/hadith/2.json", hadith(2, [3, 2]));
    await write("core/hadith/1.json", hadith(1, [1]));
    await git("add", "core");
    expect(await findings(accepted)).toEqual([
      "core/hadith/2.json hadith.member_order /member_occurrence_ids",
    ]);

    await write("core/hadith/2.json", hadith(2, [2, 4]));
    await git("add", "core");
    expect(await findings(accepted)).toEqual([
      "core/hadith/2.json reference.member_occurrence_resolves /member_occurrence_ids/1",
    ]);

    await write("core/hadith/2.json", hadith(2, [2]));
    await write(occurrencePath(3), occurrence(3, { hadith_id: 1 }));
    await git("add", "core");
    // The legacy back-reference is structurally invalid, so the accepted
    // occurrence can no longer prove it is preserved.
    expect(await findings(accepted)).toEqual([
      `${occurrencePath(3)} history.record_preserved `,
      `${occurrencePath(3)} record.schema_valid `,
    ]);
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
