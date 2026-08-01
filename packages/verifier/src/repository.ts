import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface TrackedFile {
  readonly path: string;
  readBytes(): Uint8Array;
}

export interface RepositorySnapshot {
  readonly files: readonly TrackedFile[];
}

export interface RepositoryFileInput {
  readonly bytes: Uint8Array;
  readonly path: string;
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
  const { stdout } = await execFileAsync(
    "git",
    ["-C", repositoryRoot, "ls-files", "-z"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  const paths = stdout.split("\0").filter((path) => path.length > 0);
  const inputs = await Promise.all(
    paths.map(async (path) => {
      requireRepositoryPath(path);
      return {
        bytes: await readFile(resolve(repositoryRoot, path)),
        path,
      };
    }),
  );
  return createRepositorySnapshot(inputs);
}
