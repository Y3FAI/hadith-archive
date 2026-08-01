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
  OpenHadithRecord,
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
  createSchemaRegistry,
  type RecordValidationResult,
  type SchemaRegistry,
  type StructuralValidationError,
} from "./schema-registry.ts";
