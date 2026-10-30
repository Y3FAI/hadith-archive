import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parseCanonicalJsonBytes } from "@hadith-archive/canonical-json";
import Ajv2020, {
  type AnySchemaObject,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020";

import { RECORD_SCHEMA_CATALOG, type RecordType } from "./catalog.ts";

export const SCHEMA_BASE_URL =
  "https://haditharchive.com/schemas/";

export const EXPECTED_SCHEMA_PATHS = Object.freeze([
  "common/v1.schema.json",
  ...RECORD_SCHEMA_CATALOG.map((entry) => entry.relativePath),
]);

type IdentifiedSchema = AnySchemaObject & { $id: string };

export interface StructuralValidationError {
  instancePath: string;
  keyword: string;
  message: string;
  params: Readonly<Record<string, unknown>>;
  schemaPath: string;
}

export interface RecordValidationResult {
  errors: readonly StructuralValidationError[];
  known: boolean;
  valid: boolean;
}

export interface SchemaRegistry {
  schemaCount: number;
  validateRecord(record: unknown): RecordValidationResult;
}

export type SchemaCatalogIssueKind =
  | "id_mismatch"
  | "meta_invalid"
  | "reference_invalid";

export interface SchemaCatalogIssue {
  readonly instancePath: string;
  readonly kind: SchemaCatalogIssueKind;
  readonly message: string;
  readonly relativePath: string;
}

export interface SchemaCatalogInspection {
  readonly issues: readonly SchemaCatalogIssue[];
  readonly registry?: SchemaRegistry;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function copyErrors(
  errors: ErrorObject[] | null | undefined,
): readonly StructuralValidationError[] {
  if (errors === null || errors === undefined) {
    return Object.freeze([]);
  }
  return Object.freeze(errors.map((error) => Object.freeze({
    instancePath: error.instancePath,
    keyword: error.keyword,
    message: error.message ?? "Schema validation failed",
    params: Object.freeze({ ...error.params }),
    schemaPath: error.schemaPath,
  })).sort((left, right) =>
    compareText(left.instancePath, right.instancePath) ||
    compareText(left.keyword, right.keyword) ||
    compareText(left.schemaPath, right.schemaPath) ||
    compareText(left.message, right.message)
  ));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordType(value: unknown): value is RecordType {
  return RECORD_SCHEMA_CATALOG.some((entry) => entry.recordType === value);
}

function recordSchemaKey(recordType: RecordType, schemaVersion: number): string {
  return `${recordType}:${schemaVersion}`;
}

function createAjv(): Ajv2020 {
  return new Ajv2020({
    allErrors: true,
    coerceTypes: false,
    removeAdditional: false,
    strict: true,
    useDefaults: false,
    validateSchema: true,
  });
}

function escapePointerToken(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function collectReferences(
  value: unknown,
  instancePath = "",
): readonly { readonly instancePath: string; readonly reference: unknown }[] {
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      collectReferences(child, `${instancePath}/${index}`)
    );
  }
  if (!isObject(value)) {
    return [];
  }
  const references = Object.hasOwn(value, "$ref")
    ? [{ instancePath: `${instancePath}/$ref`, reference: value["$ref"] }]
    : [];
  return references.concat(Object.entries(value).flatMap(([key, child]) =>
    key === "$ref"
      ? []
      : collectReferences(child, `${instancePath}/${escapePointerToken(key)}`)
  ));
}

function resolvePointer(document: unknown, fragment: string): boolean {
  if (fragment === "") {
    return true;
  }
  if (!fragment.startsWith("/")) {
    return false;
  }
  let current: unknown = document;
  for (const encodedToken of fragment.slice(1).split("/")) {
    let token: string;
    try {
      token = decodeURIComponent(encodedToken)
        .replaceAll("~1", "/")
        .replaceAll("~0", "~");
    } catch {
      return false;
    }
    if (!isObject(current) && !Array.isArray(current)) {
      return false;
    }
    if (!Object.hasOwn(current, token)) {
      return false;
    }
    current = (current as Record<string, unknown>)[token];
  }
  return true;
}

function inspectReference(
  reference: unknown,
  sourcePath: string,
  documents: ReadonlyMap<string, unknown>,
): boolean {
  if (typeof reference !== "string") {
    return false;
  }
  if (reference.startsWith("#")) {
    return resolvePointer(documents.get(sourcePath), reference.slice(1));
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith("//")) {
    return false;
  }
  let resolved: URL;
  try {
    resolved = new URL(reference, `${SCHEMA_BASE_URL}${sourcePath}`);
  } catch {
    return false;
  }
  const targetId = `${resolved.origin}${resolved.pathname}`;
  if (!targetId.startsWith(SCHEMA_BASE_URL)) {
    return false;
  }
  const targetPath = targetId.slice(SCHEMA_BASE_URL.length);
  const target = documents.get(targetPath);
  return target !== undefined && EXPECTED_SCHEMA_PATHS.includes(targetPath) &&
    resolvePointer(target, resolved.hash.slice(1));
}

function compileRegistry(schemas: ReadonlyMap<string, IdentifiedSchema>): SchemaRegistry {
  const ajv = createAjv();
  for (const path of EXPECTED_SCHEMA_PATHS) {
    const schema = schemas.get(path);
    if (schema === undefined) {
      throw new Error(`Required schema ${path} was not loaded`);
    }
    ajv.addSchema(schema);
  }
  const validators = new Map<string, ValidateFunction>();
  for (const entry of RECORD_SCHEMA_CATALOG) {
    const schema = schemas.get(entry.relativePath);
    const validator = schema === undefined ? undefined : ajv.getSchema(schema.$id);
    if (validator === undefined) {
      throw new Error(`Ajv did not compile schema ${entry.relativePath}`);
    }
    validators.set(recordSchemaKey(entry.recordType, entry.schemaVersion), validator);
  }

  return Object.freeze({
    schemaCount: schemas.size,
    validateRecord(record: unknown): RecordValidationResult {
      if (!isObject(record)) {
        return Object.freeze({ errors: Object.freeze([]), known: false, valid: false });
      }
      const recordType = record["record_type"];
      const schemaVersion = record["schema_version"];
      if (!isRecordType(recordType) || typeof schemaVersion !== "number") {
        return Object.freeze({ errors: Object.freeze([]), known: false, valid: false });
      }
      const validator = validators.get(recordSchemaKey(recordType, schemaVersion));
      if (validator === undefined) {
        return Object.freeze({ errors: Object.freeze([]), known: false, valid: false });
      }
      const valid = validator(record);
      return Object.freeze({ errors: copyErrors(validator.errors), known: true, valid });
    },
  });
}

export function inspectSchemaCatalog(
  documents: ReadonlyMap<string, unknown>,
): SchemaCatalogInspection {
  const issues: SchemaCatalogIssue[] = [];
  const schemas = new Map<string, IdentifiedSchema>();
  const metaAjv = createAjv();

  for (const path of EXPECTED_SCHEMA_PATHS) {
    const value = documents.get(path);
    if (value === undefined) {
      continue;
    }
    const expectedId = `${SCHEMA_BASE_URL}${path}`;
    if (!isObject(value) || value["$id"] !== expectedId) {
      issues.push({
        instancePath: "/$id",
        kind: "id_mismatch",
        message: "Schema identifier does not match its repository path",
        relativePath: path,
      });
    }
    try {
      if (!metaAjv.validateSchema(value as AnySchemaObject)) {
        for (const error of metaAjv.errors ?? []) {
          issues.push({
            instancePath: error.instancePath,
            kind: "meta_invalid",
            message: `Schema is invalid: ${error.keyword}`,
            relativePath: path,
          });
        }
      }
    } catch {
      issues.push({
        instancePath: "",
        kind: "meta_invalid",
        message: "Schema is invalid",
        relativePath: path,
      });
    }
    for (const reference of collectReferences(value)) {
      if (!inspectReference(reference.reference, path, documents)) {
        issues.push({
          instancePath: reference.instancePath,
          kind: "reference_invalid",
          message: "Schema reference is not an exact resolvable local reference",
          relativePath: path,
        });
      }
    }
    if (isObject(value) && typeof value["$id"] === "string") {
      schemas.set(path, value as IdentifiedSchema);
    }
  }

  issues.sort((left, right) =>
    compareText(left.relativePath, right.relativePath) ||
    compareText(left.instancePath, right.instancePath) ||
    compareText(left.kind, right.kind) ||
    compareText(left.message, right.message)
  );
  if (issues.length > 0 || schemas.size !== EXPECTED_SCHEMA_PATHS.length) {
    return Object.freeze({
      issues: Object.freeze(issues.map((issue) => Object.freeze(issue))),
    });
  }
  try {
    return Object.freeze({
      issues: Object.freeze([]),
      registry: compileRegistry(schemas),
    });
  } catch {
    return Object.freeze({
      issues: Object.freeze([Object.freeze({
        instancePath: "",
        kind: "reference_invalid" as const,
        message: "Schema catalog could not be compiled from exact local references",
        relativePath: "common/v1.schema.json",
      })]),
    });
  }
}

export async function createSchemaRegistry(repositoryRoot: string): Promise<SchemaRegistry> {
  const documents = new Map<string, unknown>();
  for (const path of EXPECTED_SCHEMA_PATHS) {
    documents.set(
      path,
      parseCanonicalJsonBytes(await readFile(resolve(repositoryRoot, "schemas", path))),
    );
  }
  const inspection = inspectSchemaCatalog(documents);
  if (inspection.registry === undefined) {
    throw new Error(inspection.issues[0]?.message ?? "Schema catalog is incomplete");
  }
  return inspection.registry;
}
