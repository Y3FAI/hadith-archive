import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { parseCanonicalJsonBytes } from "@open-hadith/canonical-json";

import {
  createRepositorySnapshot,
  type RepositoryFileInput,
  type RepositorySnapshot,
} from "./repository.ts";
import { historyChanges, openGitObjects } from "./git-objects.ts";
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

async function gitText(repositoryRoot: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["--no-replace-objects", "-C", repositoryRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

export const SHALLOW_REPOSITORY_MESSAGE =
  "Full Git history is required, but this repository is a shallow clone; " +
  "run `git fetch --unshallow` (or use actions/checkout with fetch-depth: 0) and retry";

/** A shallow clone truncates history, so history rules cannot be trusted. */
export class ShallowRepositoryError extends Error {
  constructor() {
    super(SHALLOW_REPOSITORY_MESSAGE);
    this.name = "ShallowRepositoryError";
  }
}

export async function assertCompleteGitHistory(repositoryRoot: string): Promise<void> {
  // Ask Git rather than inspecting .git/shallow: linked worktrees use gitfiles.
  const answer = (await gitText(repositoryRoot, ["rev-parse", "--is-shallow-repository"])).trim();
  if (answer === "true") throw new ShallowRepositoryError();
  // Fail closed when Git cannot establish that history is complete.
  if (answer !== "false") throw new Error("Git history completeness is unknown");
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
    ["--no-replace-objects", "-C", repositoryRoot, "merge-base", "--is-ancestor", commit, "HEAD"],
  );
  return commit;
}

export async function loadRepositorySnapshotAtCommit(
  repositoryRoot: string,
  commit: string,
  pathspecs: readonly string[] = [],
): Promise<RepositorySnapshot> {
  const output = await gitText(repositoryRoot, [
    "ls-tree", "-r", "-z", commit,
    ...(pathspecs.length === 0 ? [] : ["--", ...pathspecs]),
  ]);
  const inputs: RepositoryFileInput[] = [];
  const blobs = new Map<string, Uint8Array>();
  const objects = openGitObjects(repositoryRoot);
  try {
    for (const line of output.split("\0").filter(Boolean)) {
      const match = /^([0-7]{6}) (blob|commit) ([0-9a-f]+)\t([\s\S]+)$/.exec(line);
      if (match === null) throw new Error("Invalid historical Git tree entry");
      const [, mode, type, objectId, path] = match;
      let bytes: Uint8Array = new Uint8Array();
      if (type === "blob") {
        bytes = blobs.get(objectId!) ?? await objects.readBlob(objectId!);
        blobs.set(objectId!, bytes);
      }
      inputs.push({ bytes, mode: mode!, path: path! });
    }
    await objects.finish();
    return createRepositorySnapshot(inputs);
  } finally {
    await objects.dispose();
  }
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

export async function loadGitHistoryState(
  repositoryRoot: string,
  baseReference: string,
): Promise<GitHistoryState> {
  await assertCompleteGitHistory(repositoryRoot);
  const baseCommit = await resolveGitBase(repositoryRoot, baseReference);
  const records = new Map<string, HistoricalRecord>();
  const schemas = new Map<string, string>();
  const schemaUsers = new Map<string, number>();
  const recordCache = new Map<string, HistoricalRecord>();
  const schemaCache = new Map<string, {
    readonly bytes: Uint8Array;
    readonly references: readonly string[];
  }>();
  const historicalPaths = new Map<string, Set<string>>();
  const historicalRecordViolationPaths = new Set<string>();
  const historicalSchemaBytes = new Map<string, Uint8Array>();
  const firstSchemaObjects = new Map<string, string>();
  const historicalSchemaViolationPaths = new Set<string>();
  let greatestHadithId = 0;
  let greatestOccurrenceId = 0;
  const objects = openGitObjects(repositoryRoot);

  const schemaPath = (record: HistoricalRecord) =>
    `schemas/${record.recordType}/v${record.schemaVersion}.schema.json`;
  const changeUsers = (path: string, delta: number) => {
    const count = (schemaUsers.get(path) ?? 0) + delta;
    if (count === 0) schemaUsers.delete(path);
    else schemaUsers.set(path, count);
  };

  try {
    // Each merge is compared with its first parent. Topic-branch intermediate
    // states are excluded; every change in a commit is applied before checking
    // that commit's schema dependencies (file traversal order is irrelevant).
    for await (const changes of historyChanges(repositoryRoot, baseCommit)) {
      let schemaGraphChanged = false;
      for (const change of changes) {
        const { path, objectId, mode } = change;
        if (!path.startsWith("schemas/") && !path.endsWith(".json")) continue;
        if (mode !== "000000" && mode !== "100644" && mode !== "100755") {
          throw new Error("Historical data is not a regular Git file");
        }
        if (path.startsWith("schemas/")) {
          schemaGraphChanged = true;
          if (mode === "000000") schemas.delete(path);
          else schemas.set(path, objectId);
          const first = firstSchemaObjects.get(path);
          if (first !== undefined && first !== schemas.get(path)) {
            historicalSchemaViolationPaths.add(path);
          }
          continue;
        }
        if (!path.startsWith("core/")) continue;
        const previous = records.get(path);
        let record: HistoricalRecord | undefined;
        if (mode !== "000000") {
          let cached = recordCache.get(objectId);
          if (cached === undefined) {
            cached = historicalRecordFromValue("", parseCanonicalJsonBytes(await objects.readBlob(objectId)));
            recordCache.set(objectId, cached);
          }
          record = Object.freeze({ ...cached, path });
        }
        if (previous !== undefined && previous.entityKey !== record?.entityKey) {
          historicalRecordViolationPaths.add(path);
        }
        const oldSchema = previous === undefined ? undefined : schemaPath(previous);
        const newSchema = record === undefined ? undefined : schemaPath(record);
        if (oldSchema !== newSchema) {
          // Traversal depends on active schema roots, not the number of records.
          if (oldSchema !== undefined) {
            changeUsers(oldSchema, -1);
            if (!schemaUsers.has(oldSchema)) schemaGraphChanged = true;
          }
          if (newSchema !== undefined) {
            if (!schemaUsers.has(newSchema)) schemaGraphChanged = true;
            changeUsers(newSchema, 1);
          }
        }
        if (record === undefined) {
          records.delete(path);
          continue;
        }
        records.set(path, record);
        const paths = historicalPaths.get(record.entityKey) ?? new Set<string>();
        paths.add(path);
        historicalPaths.set(record.entityKey, paths);
        if (record.recordType === "hadith") {
          greatestHadithId = Math.max(greatestHadithId, record.numericId ?? 0);
        }
        if (record.recordType === "occurrence") {
          greatestOccurrenceId = Math.max(greatestOccurrenceId, record.numericId ?? 0);
        }
      }
      if (!schemaGraphChanged) continue;
      const pending = [...schemaUsers.keys()];
      const visited = new Set<string>();
      while (pending.length > 0) {
        const path = pending.pop()!;
        if (visited.has(path)) continue;
        visited.add(path);
        const objectId = schemas.get(path);
        if (objectId === undefined) throw new Error("Used historical schema is missing");
        let schema = schemaCache.get(objectId);
        if (schema === undefined) {
          const bytes = await objects.readBlob(objectId);
          schema = { bytes, references: collectReferences(parseCanonicalJsonBytes(bytes)) };
          schemaCache.set(objectId, schema);
        }
        if (!firstSchemaObjects.has(path)) {
          firstSchemaObjects.set(path, objectId);
          historicalSchemaBytes.set(path, schema.bytes);
        }
        const relativePath = path.slice("schemas/".length);
        for (const reference of schema.references) {
          if (reference.startsWith("#")) continue;
          const resolved = new URL(reference, `${SCHEMA_BASE_URL}${relativePath}`);
          const target = `${resolved.origin}${resolved.pathname}`;
          if (!target.startsWith(SCHEMA_BASE_URL)) {
            throw new Error("Historical schema uses a remote reference");
          }
          pending.push(`schemas/${target.slice(SCHEMA_BASE_URL.length)}`);
        }
      }
    }
    await objects.finish();
  } finally {
    await objects.dispose();
  }
  const baseRecords = [...records.values()].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );
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
    usedSchemaPaths: new Set(firstSchemaObjects.keys()),
  });
}

export function createHistoryVerificationContext(
  context: StructuralVerificationContext,
  history: GitHistoryState,
): HistoryVerificationContext {
  return Object.freeze({ ...context, history });
}
