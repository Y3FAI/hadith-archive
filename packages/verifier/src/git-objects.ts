import type { ReadableStream, ReadableStreamDefaultReader } from "node:stream/web";

// Git's batch protocol is binary: each header is followed by an exact byte count
// and one LF. Keep at most one object's bytes, not the complete process output.
export class GitOutputReader {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private chunk: Uint8Array = new Uint8Array();
  private offset = 0;

  constructor(stream: ReadableStream<Uint8Array>) {
    this.reader = stream.getReader();
  }

  private async available(): Promise<boolean> {
    while (this.offset === this.chunk.length) {
      const next = await this.reader.read();
      if (next.done) return false;
      this.chunk = next.value;
      this.offset = 0;
    }
    return true;
  }

  async until(delimiter: number): Promise<Buffer | undefined> {
    const parts: Uint8Array[] = [];
    while (await this.available()) {
      const end = this.chunk.indexOf(delimiter, this.offset);
      if (end >= 0) {
        parts.push(this.chunk.subarray(this.offset, end));
        this.offset = end + 1;
        return Buffer.concat(parts);
      }
      parts.push(this.chunk.subarray(this.offset));
      this.offset = this.chunk.length;
    }
    if (parts.length > 0) throw new Error("Truncated Git output");
    return undefined;
  }

  async bytes(length: number): Promise<Buffer> {
    const parts: Uint8Array[] = [];
    let remaining = length;
    while (remaining > 0) {
      if (!await this.available()) throw new Error("Truncated Git blob");
      const count = Math.min(remaining, this.chunk.length - this.offset);
      parts.push(this.chunk.subarray(this.offset, this.offset + count));
      this.offset += count;
      remaining -= count;
    }
    return Buffer.concat(parts, length);
  }
}

export function openGitObjects(repositoryRoot: string) {
  const child = Bun.spawn([
    "git", "--no-replace-objects", "-C", repositoryRoot, "cat-file", "--batch",
  ], { stdin: "pipe", stdout: "pipe", stderr: "ignore" });
  const output = new GitOutputReader(child.stdout);
  return {
    // Calls are sequential: each request consumes exactly one response.
    async readBlob(objectId: string): Promise<Uint8Array> {
      if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(objectId)) {
        throw new Error("Invalid Git object ID");
      }
      child.stdin.write(`${objectId}\n`);
      await child.stdin.flush();
      const header = (await output.until(0x0a))?.toString("ascii").split(" ");
      const size = Number(header?.[2]);
      if (
        header?.length !== 3 || header[0] !== objectId || header[1] !== "blob" ||
        !Number.isSafeInteger(size) || size < 0
      ) {
        throw new Error("Git object is unavailable or is not a blob");
      }
      const bytes = await output.bytes(size);
      if ((await output.bytes(1))[0] !== 0x0a) throw new Error("Invalid Git blob framing");
      return bytes;
    },
    async finish(): Promise<void> {
      child.stdin.end();
      if (await output.until(0x0a) !== undefined || await child.exited !== 0) {
        throw new Error("Git object reader did not complete");
      }
    },
    async dispose(): Promise<void> {
      if (child.exitCode === null) child.kill();
      await child.exited;
    },
  };
}

export interface GitHistoryChange {
  readonly path: string;
  readonly mode: string;
  readonly objectId: string;
}

export async function* historyChanges(
  repositoryRoot: string,
  baseCommit: string,
): AsyncGenerator<readonly GitHistoryChange[]> {
  const child = Bun.spawn([
    "git", "--no-replace-objects", "-C", repositoryRoot,
    "log", "--first-parent", "--reverse", "--format=%H", "-z", "--raw",
    "--no-abbrev", "--no-renames", "--no-relative", "--no-ext-diff",
    "--no-textconv", "--ignore-submodules=none", "--diff-merges=first-parent",
    "--root", baseCommit, "--", "core", "schemas",
  ], { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
  const output = new GitOutputReader(child.stdout);
  let changes: GitHistoryChange[] = [];
  let hasCommit = false;
  try {
    while (true) {
      const token = await output.until(0);
      if (token === undefined) break;
      const field = token.toString("utf8").replace(/^\n+/, "");
      if (field === "") continue;
      if (/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(field)) {
        if (hasCommit) yield changes;
        changes = [];
        hasCommit = true;
        continue;
      }
      const match = /^:[0-7]{6} ([0-7]{6}) [0-9a-f]+ ([0-9a-f]+) [AMDT]$/.exec(field);
      const path = await output.until(0);
      if (!hasCommit || match === null || path === undefined) {
        throw new Error("Invalid Git history change stream");
      }
      changes.push({ mode: match[1]!, objectId: match[2]!, path: path.toString("utf8") });
    }
    if (await child.exited !== 0) throw new Error("Git history could not be read");
    if (hasCommit) yield changes;
  } finally {
    if (child.exitCode === null) child.kill();
    await child.exited;
  }
}
