import { parseCanonicalJsonBytes } from "@open-hadith/canonical-json";
import {
  EXPECTED_SCHEMA_PATHS,
  inspectSchemaCatalog,
  loadCoreRecordBytes,
  type LoadedCoreRecord,
  type SchemaCatalogInspection,
} from "@open-hadith/core-loader";

import type { RepositorySnapshot, TrackedFile } from "./repository.ts";

export interface CoreRecordCandidate {
  readonly file: TrackedFile;
  readonly value: Readonly<Record<string, unknown>>;
}

export interface ValidCoreRecord {
  readonly file: TrackedFile;
  readonly record: LoadedCoreRecord;
}

export interface StructuralVerificationContext extends RepositorySnapshot {
  readonly records: readonly CoreRecordCandidate[];
  readonly schemaInspection: SchemaCatalogInspection;
  readonly schemaPaths: ReadonlySet<string>;
  readonly validRecords: readonly ValidCoreRecord[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createStructuralVerificationContext(
  snapshot: RepositorySnapshot,
): StructuralVerificationContext {
  const documents = new Map<string, unknown>();
  const schemaPaths = new Set<string>();
  const records: CoreRecordCandidate[] = [];

  for (const file of snapshot.files) {
    if (file.path.startsWith("schemas/") && file.path.endsWith(".json")) {
      const relativePath = file.path.slice("schemas/".length);
      schemaPaths.add(relativePath);
      if (EXPECTED_SCHEMA_PATHS.includes(relativePath)) {
        try {
          documents.set(relativePath, parseCanonicalJsonBytes(file.readBytes()));
        } catch {
          // File-representation rules own malformed schema bytes.
        }
      }
    }
    if (file.path.startsWith("core/") && file.path.endsWith(".json")) {
      try {
        const value = parseCanonicalJsonBytes(file.readBytes());
        if (isObject(value)) {
          records.push(Object.freeze({ file, value: Object.freeze(value) }));
        }
      } catch {
        // File-representation rules own malformed record bytes.
      }
    }
  }

  const validRecords: ValidCoreRecord[] = [];
  const registry = inspectSchemaCatalog(documents);
  if (registry.registry !== undefined) {
    for (const candidate of records) {
      const loaded = loadCoreRecordBytes(candidate.file.readBytes(), registry.registry);
      if (loaded.ok) {
        validRecords.push(Object.freeze({ file: candidate.file, record: loaded.record }));
      }
    }
  }

  return Object.freeze({
    files: snapshot.files,
    records: Object.freeze(records),
    schemaInspection: registry,
    schemaPaths,
    validRecords: Object.freeze(validRecords),
  });
}
