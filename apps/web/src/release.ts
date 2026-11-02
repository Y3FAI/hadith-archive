import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { exportCsv, exportJsonl } from "./export.ts";
import { loadInputs, REPOSITORY_ROOT } from "./inputs.ts";

// A data release, built from a signed tag alone: the record files as Git
// archives them at the tag, the JSONL and CSV exports of those same files,
// and SHA256SUMS over the three. Rerunning it at the same tag gives the
// same files.

const USAGE = "Usage: bun run release <tag>, such as v1.0.0; writes artifacts/release/<tag>/\n";
const DATA = ["core", "topics", "schemas", "LICENSE", "CREDITS.md"];

async function git(args: readonly string[]): Promise<string> {
  const child = Bun.spawn(["git", ...args], { cwd: REPOSITORY_ROOT, stderr: "pipe", stdout: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`git ${args[0]}: ${stderr.trim()}`);
  return stdout;
}

const tag = process.argv[2];
if (tag === undefined || !/^v\d+\.\d+\.\d+$/.test(tag) || process.argv.length > 3) {
  process.stderr.write(USAGE);
  process.exit(2);
}
if ((await git(["cat-file", "-t", tag]).catch(() => "")).trim() !== "tag") {
  process.stderr.write(`${tag} is not an annotated tag; create it with git tag -s ${tag}\n`);
  process.exit(1);
}
const out = resolve(REPOSITORY_ROOT, "artifacts/release", tag);
if ((await readdir(out).catch(() => [])).length > 0) {
  process.stderr.write(`${out} is not empty\n`);
  process.exit(1);
}
await mkdir(out, { recursive: true });

const archive = `hadith-archive-data-${tag}.zip`;
await git(["archive", "--format=zip", `--prefix=hadith-archive-data-${tag}/`, "-o", join(out, archive), tag, ...DATA]);

// The exports read the tag's own files, unpacked apart from the working tree.
const tree = await mkdtemp(join(tmpdir(), "hadith-archive-release-"));
try {
  const tar = join(tree, "tree.tar");
  await git(["archive", "--format=tar", "-o", tar, tag, "core", "topics", "config/site.json"]);
  const unpacked = Bun.spawnSync(["tar", "-x", "-f", tar, "-C", tree]);
  if (unpacked.exitCode !== 0) throw new Error("tar could not unpack the tag's files");
  const loaded = await loadInputs({
    core: join(tree, "core"),
    site: join(tree, "config/site.json"),
    topics: join(tree, "topics"),
  });
  if (!loaded.ok) {
    for (const finding of loaded.findings) process.stderr.write(`${finding.file} ${finding.path}: ${finding.message}\n`);
    process.stderr.write("Release refused.\n");
    process.exit(1);
  }
  await writeFile(join(out, "hadith.jsonl"), exportJsonl(loaded.inputs));
  await writeFile(join(out, "hadith.csv"), exportCsv(loaded.inputs));
} finally {
  await rm(tree, { force: true, recursive: true });
}

const files = [archive, "hadith.csv", "hadith.jsonl"].sort();
const sums = await Promise.all(files.map(async (name) =>
  `${createHash("sha256").update(await readFile(join(out, name))).digest("hex")}  ${name}\n`
));
await writeFile(join(out, "SHA256SUMS"), sums.join(""));
process.stdout.write(`Released ${tag} into ${out}:\n${[...files, "SHA256SUMS"].map((name) => `  ${name}\n`).join("")}`);
