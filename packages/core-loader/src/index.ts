export {
  RECORD_SCHEMA_CATALOG,
  type RecordSchemaCatalogEntry,
  type RecordType,
  type RecordTypeName,
} from "./catalog.ts";
export type { DeepReadonly } from "./deep-readonly.ts";
export type {
  HadithRecord,
  Location,
  OccurrenceRecord,
  HadithArchiveRecord,
  ReferenceScheme,
  SectionRecord,
  SourceRecord,
  SourceWitnessRecord,
} from "./generated/records.ts";
export {
  createCoreLoader,
  loadCoreRecordBytes,
  loadCoreRecordFile,
  type CoreLoader,
  type CoreRecordLoadFailure,
  type CoreRecordLoadResult,
  type LoadedCoreRecord,
} from "./loader.ts";
export {
  EXPECTED_SCHEMA_PATHS,
  SCHEMA_BASE_URL,
  createSchemaRegistry,
  inspectSchemaCatalog,
  type RecordValidationResult,
  type SchemaCatalogInspection,
  type SchemaCatalogIssue,
  type SchemaCatalogIssueKind,
  type SchemaRegistry,
  type StructuralValidationError,
} from "./schema-registry.ts";
