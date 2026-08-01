import { readFile } from "node:fs/promises";

import {
  CanonicalJsonError,
  type CanonicalJsonErrorCode,
  isCanonicalJsonObject,
  parseCanonicalJsonBytes,
} from "@open-hadith/canonical-json";

import { deepFreeze, type DeepReadonly } from "./deep-readonly.ts";
import type { OpenHadithRecord } from "./generated/records.ts";
import {
  createSchemaRegistry,
  type SchemaRegistry,
  type StructuralValidationError,
} from "./schema-registry.ts";

export type LoadedCoreRecord = DeepReadonly<OpenHadithRecord>;

export type CoreRecordLoadFailure =
  | Readonly<{
      code: CanonicalJsonErrorCode;
      kind: "canonical_json";
      message: string;
      offset?: number;
    }>
  | Readonly<{
      kind: "read_error";
      message: string;
    }>
  | Readonly<{
      kind: "schema_invalid";
      errors: readonly StructuralValidationError[];
    }>
  | Readonly<{
      kind: "schema_unknown";
      recordType: unknown;
      schemaVersion: unknown;
    }>;

export type CoreRecordLoadResult =
  | Readonly<{
      failure: CoreRecordLoadFailure;
      ok: false;
    }>
  | Readonly<{
      ok: true;
      record: LoadedCoreRecord;
    }>;

export interface CoreLoader {
  loadBytes(bytes: Uint8Array): CoreRecordLoadResult;
  loadFile(filePath: string): Promise<CoreRecordLoadResult>;
  registry: SchemaRegistry;
}

function canonicalFailure(error: CanonicalJsonError): CoreRecordLoadResult {
  const failure = {
    code: error.code,
    kind: "canonical_json" as const,
    message: error.message,
    ...(error.offset === undefined ? {} : { offset: error.offset }),
  };
  return Object.freeze({ failure: Object.freeze(failure), ok: false });
}

export function loadCoreRecordBytes(
  bytes: Uint8Array,
  registry: SchemaRegistry,
): CoreRecordLoadResult {
  let candidate: ReturnType<typeof parseCanonicalJsonBytes>;
  try {
    candidate = parseCanonicalJsonBytes(bytes);
  } catch (error: unknown) {
    if (error instanceof CanonicalJsonError) {
      return canonicalFailure(error);
    }
    throw error;
  }

  const validation = registry.validateRecord(candidate);
  if (!validation.known) {
    const objectCandidate = isCanonicalJsonObject(candidate) ? candidate : {};
    return deepFreeze({
      failure: {
        kind: "schema_unknown" as const,
        recordType: objectCandidate["record_type"],
        schemaVersion: objectCandidate["schema_version"],
      },
      ok: false,
    });
  }
  if (!validation.valid) {
    return Object.freeze({
      failure: Object.freeze({
        errors: validation.errors,
        kind: "schema_invalid" as const,
      }),
      ok: false,
    });
  }

  return Object.freeze({
    ok: true,
    record: deepFreeze(candidate as unknown as OpenHadithRecord),
  });
}

export async function loadCoreRecordFile(
  filePath: string,
  registry: SchemaRegistry,
): Promise<CoreRecordLoadResult> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(filePath);
  } catch {
    return Object.freeze({
      failure: Object.freeze({
        kind: "read_error" as const,
        message: "Core record could not be read",
      }),
      ok: false,
    });
  }

  return loadCoreRecordBytes(bytes, registry);
}

export async function createCoreLoader(
  repositoryRoot: string,
): Promise<CoreLoader> {
  const registry = await createSchemaRegistry(repositoryRoot);
  return Object.freeze({
    loadBytes: (bytes: Uint8Array) => loadCoreRecordBytes(bytes, registry),
    loadFile: (filePath: string) => loadCoreRecordFile(filePath, registry),
    registry,
  });
}
