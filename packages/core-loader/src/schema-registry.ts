import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parseCanonicalJsonBytes } from "@open-hadith/canonical-json";
import Ajv2020, {
  type AnySchemaObject,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020";

import { RECORD_SCHEMA_CATALOG, type RecordType } from "./catalog.ts";

const SCHEMA_BASE_URL =
  "https://raw.githubusercontent.com/Y3FAI/open-hadith/main/schemas/";

const SCHEMA_FILES = [
  "common/v1.schema.json",
  ...RECORD_SCHEMA_CATALOG.map((entry) => entry.relativePath),
] as const;

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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareErrors(
  left: StructuralValidationError,
  right: StructuralValidationError,
): number {
  return (
    compareText(left.instancePath, right.instancePath) ||
    compareText(left.keyword, right.keyword) ||
    compareText(left.schemaPath, right.schemaPath) ||
    compareText(left.message, right.message)
  );
}

function copyErrors(
  errors: ErrorObject[] | null | undefined,
): readonly StructuralValidationError[] {
  if (errors === null || errors === undefined) {
    return Object.freeze([]);
  }

  return Object.freeze(
    errors
      .map((error) =>
        Object.freeze({
          instancePath: error.instancePath,
          keyword: error.keyword,
          message: error.message ?? "Schema validation failed",
          params: Object.freeze({ ...error.params }),
          schemaPath: error.schemaPath,
        })
      )
      .sort(compareErrors),
  );
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

function requireIdentifiedSchema(
  value: unknown,
  relativePath: string,
): IdentifiedSchema {
  if (!isObject(value) || typeof value["$id"] !== "string") {
    throw new Error(`Schema ${relativePath} must declare a string $id`);
  }

  const expectedId = `${SCHEMA_BASE_URL}${relativePath}`;
  if (value["$id"] !== expectedId) {
    throw new Error(
      `Schema ${relativePath} declares ${value["$id"]}; expected ${expectedId}`,
    );
  }

  return value as IdentifiedSchema;
}

function requireValidator(
  ajv: Ajv2020,
  schema: IdentifiedSchema,
): ValidateFunction {
  const validator = ajv.getSchema(schema.$id);
  if (validator === undefined) {
    throw new Error(`Ajv did not compile schema ${schema.$id}`);
  }

  return validator;
}

export async function createSchemaRegistry(
  repositoryRoot: string,
): Promise<SchemaRegistry> {
  const ajv = new Ajv2020({
    allErrors: true,
    coerceTypes: false,
    removeAdditional: false,
    strict: true,
    useDefaults: false,
    validateSchema: true,
  });
  const schemas = new Map<string, IdentifiedSchema>();

  for (const relativePath of SCHEMA_FILES) {
    const absolutePath = resolve(repositoryRoot, "schemas", relativePath);
    const schema = requireIdentifiedSchema(
      parseCanonicalJsonBytes(await readFile(absolutePath)),
      relativePath,
    );

    if (!ajv.validateSchema(schema)) {
      throw new Error(
        `Schema ${relativePath} does not validate against Draft 2020-12: ${ajv.errorsText(ajv.errors)}`,
      );
    }

    ajv.addSchema(schema);
    schemas.set(relativePath, schema);
  }

  const recordValidators = new Map<string, ValidateFunction>();
  for (const entry of RECORD_SCHEMA_CATALOG) {
    const schema = schemas.get(entry.relativePath);
    if (schema === undefined) {
      throw new Error(`Required schema ${entry.relativePath} was not loaded`);
    }

    recordValidators.set(
      recordSchemaKey(entry.recordType, entry.schemaVersion),
      requireValidator(ajv, schema),
    );
  }

  return Object.freeze({
    schemaCount: schemas.size,
    validateRecord(record: unknown): RecordValidationResult {
      if (!isObject(record)) {
        return Object.freeze({
          errors: Object.freeze([]),
          known: false,
          valid: false,
        });
      }

      const recordType = record["record_type"];
      const schemaVersion = record["schema_version"];
      if (!isRecordType(recordType) || typeof schemaVersion !== "number") {
        return Object.freeze({
          errors: Object.freeze([]),
          known: false,
          valid: false,
        });
      }

      const validator = recordValidators.get(
        recordSchemaKey(recordType, schemaVersion),
      );
      if (validator === undefined) {
        return Object.freeze({
          errors: Object.freeze([]),
          known: false,
          valid: false,
        });
      }

      const valid = validator(record);
      return Object.freeze({
        errors: copyErrors(validator.errors),
        known: true,
        valid,
      });
    },
  });
}
