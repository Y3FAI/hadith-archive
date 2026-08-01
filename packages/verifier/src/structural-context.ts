import { parseCanonicalJsonBytes } from "@open-hadith/canonical-json";
import {
  EXPECTED_SCHEMA_PATHS,
  inspectSchemaCatalog,
  type SchemaCatalogInspection,
} from "@open-hadith/core-loader";

import type { RepositorySnapshot, TrackedFile } from "./repository.ts";

export interface CoreRecordCandidate {
  readonly file: TrackedFile;
  readonly value: Readonly<Record<string, unknown>>;
}

export interface StructuralVerificationContext extends RepositorySnapshot {
  readonly records: readonly CoreRecordCandidate[];
  readonly schemaInspection: SchemaCatalogInspection;
  readonly schemaPaths: ReadonlySet<string>;
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

  return Object.freeze({
    files: snapshot.files,
    records: Object.freeze(records),
    schemaInspection: inspectSchemaCatalog(documents),
    schemaPaths,
  });
}
