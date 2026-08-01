import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import Ajv2020, {
  type AnySchemaObject,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020";

const SCHEMA_BASE_URL =
  "https://raw.githubusercontent.com/Y3FAI/open-hadith/main/schemas/";

const SCHEMA_FILES = [
  "common/v1.schema.json",
  "hadith/v1.schema.json",
  "occurrence/v1.schema.json",
  "section/v1.schema.json",
  "source/v1.schema.json",
  "source_witness/v1.schema.json",
] as const;

const RECORD_SCHEMA_FILES = [
  ["hadith", 1, "hadith/v1.schema.json"],
  ["occurrence", 1, "occurrence/v1.schema.json"],
  ["section", 1, "section/v1.schema.json"],
  ["source", 1, "source/v1.schema.json"],
  ["source_witness", 1, "source_witness/v1.schema.json"],
] as const;

type RecordType = (typeof RECORD_SCHEMA_FILES)[number][0];

type IdentifiedSchema = AnySchemaObject & { $id: string };

export interface RecordValidationResult {
  errors: ErrorObject[];
  valid: boolean;
}

export interface SchemaRegistry {
  ajv: Ajv2020;
  schemaCount: number;
  schemas: ReadonlyMap<string, IdentifiedSchema>;
  validateRecord(record: unknown): RecordValidationResult;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordType(value: unknown): value is RecordType {
  return RECORD_SCHEMA_FILES.some(([recordType]) => recordType === value);
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

  return value as unknown as IdentifiedSchema;
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
    const source = await readFile(absolutePath, "utf8");
    const schema = requireIdentifiedSchema(JSON.parse(source), relativePath);

    if (!ajv.validateSchema(schema)) {
      throw new Error(
        `Schema ${relativePath} does not validate against Draft 2020-12: ${ajv.errorsText(ajv.errors)}`,
      );
    }

    ajv.addSchema(schema);
    schemas.set(relativePath, schema);
  }

  const recordValidators = new Map<string, ValidateFunction>();
  for (const [recordType, schemaVersion, relativePath] of RECORD_SCHEMA_FILES) {
    const schema = schemas.get(relativePath);
    if (schema === undefined) {
      throw new Error(`Required schema ${relativePath} was not loaded`);
    }

    recordValidators.set(
      recordSchemaKey(recordType, schemaVersion),
      requireValidator(ajv, schema),
    );
  }

  return {
    ajv,
    schemaCount: schemas.size,
    schemas,
    validateRecord(record: unknown): RecordValidationResult {
      if (!isObject(record)) {
        return {
          errors: [],
          valid: false,
        };
      }

      const recordType = record["record_type"];
      const schemaVersion = record["schema_version"];
      if (!isRecordType(recordType) || typeof schemaVersion !== "number") {
        return {
          errors: [],
          valid: false,
        };
      }

      const validator = recordValidators.get(
        recordSchemaKey(recordType, schemaVersion),
      );
      if (validator === undefined) {
        return {
          errors: [],
          valid: false,
        };
      }

      const valid = validator(record);
      return {
        errors: validator.errors === null || validator.errors === undefined
          ? []
          : [...validator.errors],
        valid,
      };
    },
  };
}
