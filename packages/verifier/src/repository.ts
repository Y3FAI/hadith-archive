import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface TrackedFile {
  readonly mode: string;
  readonly path: string;
  readBytes(): Uint8Array;
}

export interface RepositorySnapshot {
  readonly files: readonly TrackedFile[];
}

export interface RepositoryFileInput {
  readonly bytes: Uint8Array;
  readonly mode?: string;
  readonly path: string;
}

export function isRegularFile(file: TrackedFile): boolean {
  return file.mode === "100644" || file.mode === "100755";
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireRepositoryPath(path: string): void {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.includes("\\") ||
    path.split("/").some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new Error("Git returned an invalid repository-relative path");
  }
}

export function createRepositorySnapshot(
  inputs: readonly RepositoryFileInput[],
): RepositorySnapshot {
  const seen = new Set<string>();
  const files = inputs.map((input): TrackedFile => {
    requireRepositoryPath(input.path);
    if (seen.has(input.path)) {
      throw new Error("Repository snapshot contains a duplicate path");
    }
    seen.add(input.path);
    const storedBytes = Uint8Array.from(input.bytes);
    return Object.freeze({
      mode: input.mode ?? "100644",
      path: input.path,
      readBytes: () => Uint8Array.from(storedBytes),
    });
  });
  files.sort((left, right) => compareText(left.path, right.path));
  return Object.freeze({ files: Object.freeze(files) });
}

export async function loadRepositorySnapshot(
  repositoryRoot: string,
): Promise<RepositorySnapshot> {
  // Compare the index with the empty tree to enumerate the complete candidate,
  // including unchanged files, but excluding `git add -N` placeholders. Compute
  // the empty tree ID for the repository's object format without writing it.
  const hash = Bun.spawn(["git", "-C", repositoryRoot, "hash-object", "-t", "tree", "--stdin"], {
    stdin: new Blob([]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [hashExit, hashOutput] = await Promise.all([
    hash.exited,
    new Response(hash.stdout).text(),
    new Response(hash.stderr).text(),
  ]);
  const emptyTree = hashOutput.trim();
  if (hashExit !== 0 || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(emptyTree)) {
    throw new Error("Git empty tree ID could not be determined");
  }
  const { stdout } = await execFileAsync(
    "git",
    [
      "--no-replace-objects", "-C", repositoryRoot, "diff", "--cached", "--raw",
      "-z", "--no-abbrev", "--no-renames", "--no-relative", "--no-ext-diff",
      "--no-textconv", "--ignore-submodules=none", "--ita-invisible-in-index",
      emptyTree, "--",
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  const fields = stdout.split("\0");
  if (fields.pop() !== "" || fields.length % 2 !== 0) {
    throw new Error("Git index response is malformed");
  }
  const entries: { mode: string; objectId: string; path: string }[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const match = /^:000000 ([0-7]{6}) 0+ ([0-9a-f]+) A$/.exec(fields[index]!);
    if (match === null) {
      throw new Error("Git index is malformed or contains unresolved conflicts");
    }
    const mode = match[1]!;
    const objectId = match[2]!;
    const path = fields[index + 1]!;
    requireRepositoryPath(path);
    entries.push({ mode, objectId, path });
  }
  // Read only regular blobs by their captured index IDs. Never dereference a
  // working-tree path, symlink target, or submodule checkout.
  const regular = entries.filter((entry) =>
    entry.mode === "100644" || entry.mode === "100755"
  );
  const blobs = new Map<string, Uint8Array>();
  if (regular.length > 0) {
    const objectIds = [...new Set(regular.map((entry) => entry.objectId))];
    const child = Bun.spawn(["git", "--no-replace-objects", "-C", repositoryRoot, "cat-file", "--batch"], {
      stdin: new Blob([`${objectIds.join("\n")}\n`]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, output] = await Promise.all([
      child.exited,
      new Response(child.stdout).arrayBuffer(),
      new Response(child.stderr).text(),
    ]);
    if (exitCode !== 0) throw new Error("Staged Git blobs could not be read");
    const buffer = Buffer.from(output);
    let offset = 0;
    for (const objectId of objectIds) {
      const headerEnd = buffer.indexOf(0x0a, offset);
      if (headerEnd < 0) throw new Error("Git blob header is missing");
      const header = buffer.toString("ascii", offset, headerEnd).split(" ");
      const size = Number(header[2]);
      const start = headerEnd + 1;
      const end = start + size;
      if (
        header.length !== 3 || header[0] !== objectId || header[1] !== "blob" ||
        !Number.isSafeInteger(size) || size < 0 ||
        end >= buffer.length || buffer[end] !== 0x0a
      ) {
        throw new Error("Git blob response is invalid or incomplete");
      }
      blobs.set(objectId, buffer.subarray(start, end));
      offset = end + 1;
    }
    if (offset !== buffer.length) throw new Error("Unexpected Git blob response");
  }
  const inputs = entries.map(({ mode, objectId, path }) => ({
    // Non-regular entries carry metadata only; file.regular owns their finding.
    bytes: blobs.get(objectId) ?? new Uint8Array(),
    mode,
    path,
  }));
  return createRepositorySnapshot(inputs);
}
