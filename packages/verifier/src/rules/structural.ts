import {
  EXPECTED_SCHEMA_PATHS,
  RECORD_SCHEMA_CATALOG,
  type HadithArchiveRecord,
} from "@hadith-archive/core-loader";

import type { VerificationFindingInput, VerificationRule } from "../protocol.ts";
import type {
  CoreRecordCandidate,
  StructuralVerificationContext,
} from "../structural-context.ts";

function finding(
  file: string,
  instancePath: string,
  message: string,
): VerificationFindingInput {
  return { file, instancePath, message };
}

function isKnownRecord(candidate: CoreRecordCandidate): boolean {
  return RECORD_SCHEMA_CATALOG.some((entry) =>
    candidate.value["record_type"] === entry.recordType &&
    candidate.value["schema_version"] === entry.schemaVersion
  );
}

function expectedRecordPath(
  record: HadithArchiveRecord,
  actualPath: string,
  context: StructuralVerificationContext,
): string {
  switch (record.record_type) {
    case "source":
      return `core/sources/${record.source_id}/source.json`;
    case "source_witness":
      return `core/sources/${record.source_id}/witnesses/${record.witness_id}/witness.json`;
    case "section":
      return `core/sources/${record.source_id}/sections/${record.section_id}.json`;
    case "occurrence": {
      const witnesses = context.validRecords.filter((entry) =>
        entry.record.record_type === "source_witness" &&
        entry.record.witness_id === record.witness_id
      );
      const sourceSegment = witnesses.length === 1 &&
          witnesses[0]?.record.record_type === "source_witness"
        ? witnesses[0].record.source_id
        : actualPath.split("/")[2] ?? "";
      return `core/sources/${sourceSegment}/witnesses/${record.witness_id}/occurrences/${record.occurrence_id}.json`;
    }
    case "hadith":
      return `core/hadith/${record.hadith_id}.json`;
  }
}

export const schemaCatalogComplete: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => EXPECTED_SCHEMA_PATHS.flatMap((relativePath) =>
    context.schemaPaths.has(relativePath)
      ? []
      : [finding(
          `schemas/${relativePath}`,
          "",
          "Required schema is missing",
        )]
  ),
  id: "schema.catalog_complete",
  prerequisites: [],
};

function schemaIssueRule(
  id: "schema.id_matches_path" | "schema.meta_valid" | "schema.references_exact",
  kind: "id_mismatch" | "meta_invalid" | "reference_invalid",
): VerificationRule<StructuralVerificationContext> {
  return {
    evaluate: (context) => context.schemaInspection.issues
      .filter((issue) => issue.kind === kind)
      .map((issue) => finding(
        `schemas/${issue.relativePath}`,
        issue.instancePath,
        issue.message,
      )),
    id,
    prerequisites: [],
  };
}

export const schemaMetaValid = schemaIssueRule("schema.meta_valid", "meta_invalid");
export const schemaIdMatchesPath = schemaIssueRule(
  "schema.id_matches_path",
  "id_mismatch",
);
export const schemaReferencesExact = schemaIssueRule(
  "schema.references_exact",
  "reference_invalid",
);

export const recordSchemaKnown: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => context.records.flatMap((candidate) =>
    isKnownRecord(candidate)
      ? []
      : [finding(
          candidate.file.path,
          "",
          "Record type and schema version do not select a known schema",
        )]
  ),
  id: "record.schema_known",
  prerequisites: [],
};

export const recordSchemaValid: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => {
    const registry = context.schemaInspection.registry;
    if (registry === undefined) {
      return [];
    }
    return context.records.flatMap((candidate) => {
      const result = registry.validateRecord(candidate.value);
      if (!result.known || result.valid) {
        return [];
      }
      return result.errors.map((error) => finding(
        candidate.file.path,
        error.instancePath,
        `Schema validation failed: ${error.keyword} ${error.message}`,
      ));
    });
  },
  id: "record.schema_valid",
  prerequisites: [],
};

export const recordPathMatches: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => {
    const registry = context.schemaInspection.registry;
    if (registry === undefined) {
      return [];
    }
    return context.records.flatMap((candidate) => {
      const result = registry.validateRecord(candidate.value);
      if (!result.valid) {
        return [];
      }
      const record = candidate.value as unknown as HadithArchiveRecord;
      return candidate.file.path === expectedRecordPath(
        record,
        candidate.file.path,
        context,
      )
        ? []
        : [finding(
            candidate.file.path,
            "",
            "Record path does not match its declared identity",
          )];
    });
  },
  id: "record.path_matches",
  prerequisites: [],
};

export const STRUCTURAL_RULES = Object.freeze([
  schemaCatalogComplete,
  schemaMetaValid,
  schemaIdMatchesPath,
  schemaReferencesExact,
  recordSchemaKnown,
  recordSchemaValid,
  recordPathMatches,
]);
