export const RECORD_SCHEMA_CATALOG = [
  {
    recordType: "hadith",
    relativePath: "hadith/v1.schema.json",
    schemaVersion: 1,
    typeName: "HadithRecord",
  },
  {
    recordType: "occurrence",
    relativePath: "occurrence/v1.schema.json",
    schemaVersion: 1,
    typeName: "OccurrenceRecord",
  },
  {
    recordType: "section",
    relativePath: "section/v1.schema.json",
    schemaVersion: 1,
    typeName: "SectionRecord",
  },
  {
    recordType: "source",
    relativePath: "source/v1.schema.json",
    schemaVersion: 1,
    typeName: "SourceRecord",
  },
  {
    recordType: "source_witness",
    relativePath: "source_witness/v1.schema.json",
    schemaVersion: 1,
    typeName: "SourceWitnessRecord",
  },
] as const;

export type RecordSchemaCatalogEntry =
  (typeof RECORD_SCHEMA_CATALOG)[number];
export type RecordType = RecordSchemaCatalogEntry["recordType"];
export type RecordTypeName = RecordSchemaCatalogEntry["typeName"];
