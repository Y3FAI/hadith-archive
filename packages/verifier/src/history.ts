import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { parseCanonicalJsonBytes } from "@open-hadith/canonical-json";

import {
  createRepositorySnapshot,
  type RepositoryFileInput,
  type RepositorySnapshot,
} from "./repository.ts";
import type { StructuralVerificationContext } from "./structural-context.ts";

const execFileAsync = promisify(execFile);
const SCHEMA_BASE_URL =
  "https://raw.githubusercontent.com/Y3FAI/open-hadith/main/schemas/";

export interface HistoricalRecord {
  readonly entityKey: string;
  readonly numericId?: number;
  readonly path: string;
  readonly recordType: string;
  readonly schemaVersion: number;
}

export interface GitHistoryState {
  readonly baseCommit: string;
  readonly baseEntityKeys: ReadonlySet<string>;
  readonly baseRecords: readonly HistoricalRecord[];
  readonly greatestHadithId: number;
  readonly greatestOccurrenceId: number;
  readonly historicalSchemaBytes: ReadonlyMap<string, Uint8Array>;
  readonly historicalSchemaViolationPaths: ReadonlySet<string>;
  readonly historicalPaths: ReadonlyMap<string, ReadonlySet<string>>;
  readonly historicalRecordViolationPaths: ReadonlySet<string>;
  readonly usedSchemaPaths: ReadonlySet<string>;
}

export interface HistoryVerificationContext extends StructuralVerificationContext {
  readonly history: GitHistoryState;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function historicalRecordFromValue(
  path: string,
  value: unknown,
): HistoricalRecord {
  if (!isObject(value) || typeof value["record_type"] !== "string" ||
      typeof value["schema_version"] !== "number") {
    throw new Error("Historical core record has no usable identity");
  }
  const recordType = value["record_type"];
  const schemaVersion = value["schema_version"];
  let entityKey: string;
  let numericId: number | undefined;
  switch (recordType) {
    case "source":
      if (typeof value["source_id"] !== "string") throw new Error("Invalid source identity");
      entityKey = `source:${value["source_id"]}`;
      break;
    case "source_witness":
      if (typeof value["witness_id"] !== "string") throw new Error("Invalid witness identity");
      entityKey = `source_witness:${value["witness_id"]}`;
      break;
    case "section":
      if (typeof value["source_id"] !== "string" || typeof value["section_id"] !== "string") {
        throw new Error("Invalid section identity");
      }
      entityKey = `section:${value["source_id"]}\0${value["section_id"]}`;
      break;
    case "occurrence":
      if (typeof value["occurrence_id"] !== "number") throw new Error("Invalid occurrence identity");
      numericId = value["occurrence_id"];
      entityKey = `occurrence:${numericId}`;
      break;
    case "hadith":
      if (typeof value["hadith_id"] !== "number") throw new Error("Invalid hadith identity");
      numericId = value["hadith_id"];
      entityKey = `hadith:${numericId}`;
      break;
    default:
      throw new Error("Historical core record has an unknown type");
  }
  return Object.freeze({
    entityKey,
    ...(numericId === undefined ? {} : { numericId }),
    path,
    recordType,
    schemaVersion,
  });
}

function coreRecords(snapshot: RepositorySnapshot): readonly HistoricalRecord[] {
  return snapshot.files
    .filter((file) => file.path.startsWith("core/") && file.path.endsWith(".json"))
    .map((file) => historicalRecordFromValue(
      file.path,
      parseCanonicalJsonBytes(file.readBytes()),
    ));
}

async function gitText(repositoryRoot: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

async function gitBytes(repositoryRoot: string, args: readonly string[]): Promise<Uint8Array> {
  const { stdout } = await execFileAsync("git", ["-C", repositoryRoot, ...args], {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  return Uint8Array.from(stdout as unknown as Uint8Array);
}

export async function resolveGitBase(
  repositoryRoot: string,
  baseReference: string,
): Promise<string> {
  const commit = (await gitText(
    repositoryRoot,
    ["rev-parse", "--verify", `${baseReference}^{commit}`],
  )).trim();
  await execFileAsync(
    "git",
    ["-C", repositoryRoot, "merge-base", "--is-ancestor", commit, "HEAD"],
  );
  return commit;
}

export async function loadRepositorySnapshotAtCommit(
  repositoryRoot: string,
  commit: string,
  pathspecs: readonly string[] = [],
): Promise<RepositorySnapshot> {
  const output = await gitText(repositoryRoot, [
    "ls-tree",
    "-r",
    "-z",
    "--name-only",
    commit,
    ...(pathspecs.length === 0 ? [] : ["--", ...pathspecs]),
  ]);
  const paths = output.split("\0").filter((path) => path.length > 0);
  const inputs: RepositoryFileInput[] = await Promise.all(paths.map(async (path) => ({
    bytes: await gitBytes(repositoryRoot, ["show", `${commit}:${path}`]),
    path,
  })));
  return createRepositorySnapshot(inputs);
}

function collectReferences(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectReferences);
  }
  if (!isObject(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    key === "$ref" && typeof child === "string"
      ? [child]
      : collectReferences(child)
  );
}

function usedSchemas(
  baseSnapshot: RepositorySnapshot,
  records: readonly HistoricalRecord[],
): ReadonlySet<string> {
  const files = new Map(baseSnapshot.files.map((file) => [file.path, file]));
  const pending = records.map((record) =>
    `schemas/${record.recordType}/v${record.schemaVersion}.schema.json`
  );
  const used = new Set<string>();
  while (pending.length > 0) {
    const path = pending.shift();
    if (path === undefined || used.has(path)) continue;
    const file = files.get(path);
    if (file === undefined) throw new Error("Used historical schema is missing");
    used.add(path);
    const schema = parseCanonicalJsonBytes(file.readBytes());
    const relativePath = path.slice("schemas/".length);
    for (const reference of collectReferences(schema)) {
      if (reference.startsWith("#")) continue;
      const resolved = new URL(reference, `${SCHEMA_BASE_URL}${relativePath}`);
      const target = `${resolved.origin}${resolved.pathname}`;
      if (!target.startsWith(SCHEMA_BASE_URL)) {
        throw new Error("Historical schema uses a remote reference");
      }
      pending.push(`schemas/${target.slice(SCHEMA_BASE_URL.length)}`);
    }
  }
  return used;
}

export async function loadGitHistoryState(
  repositoryRoot: string,
  baseReference: string,
): Promise<GitHistoryState> {
  const baseCommit = await resolveGitBase(repositoryRoot, baseReference);
  const baseSnapshot = await loadRepositorySnapshotAtCommit(repositoryRoot, baseCommit);
  const baseRecords = coreRecords(baseSnapshot);
  // Only the target branch's authoritative lineage is policy history. Merged
  // topic-branch intermediates are intentionally excluded.
  const commits = (await gitText(
    repositoryRoot,
    ["rev-list", "--first-parent", "--reverse", baseCommit, "--", "core", "schemas"],
  )).split("\n").filter((value) => value.length > 0);
  const historicalPaths = new Map<string, Set<string>>();
  const historicalRecordViolationPaths = new Set<string>();
  const historicalSchemaBytes = new Map<string, Uint8Array>();
  const historicalSchemaViolationPaths = new Set<string>();
  let greatestHadithId = 0;
  let greatestOccurrenceId = 0;
  for (const commit of commits) {
    const snapshot = await loadRepositorySnapshotAtCommit(repositoryRoot, commit);
    const records = coreRecords(snapshot);
    for (const [entityKey, paths] of historicalPaths) {
      for (const path of paths) {
        if (!records.some(
          (record) => record.entityKey === entityKey && record.path === path,
        )) {
          historicalRecordViolationPaths.add(path);
        }
      }
    }
    for (const record of records) {
      const paths = historicalPaths.get(record.entityKey) ?? new Set<string>();
      paths.add(record.path);
      historicalPaths.set(record.entityKey, paths);
      if (record.recordType === "hadith") {
        greatestHadithId = Math.max(greatestHadithId, record.numericId ?? 0);
      }
      if (record.recordType === "occurrence") {
        greatestOccurrenceId = Math.max(greatestOccurrenceId, record.numericId ?? 0);
      }
    }
    const snapshotFiles = new Map(snapshot.files.map((file) => [file.path, file]));
    for (const [path, firstBytes] of historicalSchemaBytes) {
      const bytes = snapshotFiles.get(path)?.readBytes();
      if (
        bytes === undefined || firstBytes.length !== bytes.length ||
        firstBytes.some((byte, index) => byte !== bytes[index])
      ) {
        historicalSchemaViolationPaths.add(path);
      }
    }
    for (const path of usedSchemas(snapshot, records)) {
      const bytes = snapshotFiles.get(path)?.readBytes();
      if (bytes === undefined) throw new Error("Used historical schema is missing");
      const firstBytes = historicalSchemaBytes.get(path);
      if (firstBytes === undefined) {
        historicalSchemaBytes.set(path, bytes);
      } else if (
        firstBytes.length !== bytes.length ||
        firstBytes.some((byte, index) => byte !== bytes[index])
      ) {
        historicalSchemaViolationPaths.add(path);
      }
    }
  }
  const usedSchemaPaths = new Set(historicalSchemaBytes.keys());
  return Object.freeze({
    baseCommit,
    baseEntityKeys: new Set(baseRecords.map((record) => record.entityKey)),
    baseRecords: Object.freeze(baseRecords),
    greatestHadithId,
    greatestOccurrenceId,
    historicalSchemaBytes,
    historicalSchemaViolationPaths,
    historicalPaths: new Map([...historicalPaths].map(([key, paths]) => [key, new Set(paths)])),
    historicalRecordViolationPaths,
    usedSchemaPaths,
  });
}

export function createHistoryVerificationContext(
  context: StructuralVerificationContext,
  history: GitHistoryState,
): HistoryVerificationContext {
  return Object.freeze({ ...context, history });
}
