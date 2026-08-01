import type { VerificationFindingInput, VerificationRule } from "../protocol.ts";
import {
  historicalRecordFromValue,
  type HistoricalRecord,
  type HistoryVerificationContext,
} from "../history.ts";
import type { ValidCoreRecord } from "../structural-context.ts";

function finding(
  file: string,
  instancePath: string,
  message: string,
): VerificationFindingInput {
  return { file, instancePath, message };
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function currentRecords(
  context: HistoryVerificationContext,
): readonly { readonly entry: ValidCoreRecord; readonly identity: HistoricalRecord }[] {
  return context.validRecords.map((entry) => Object.freeze({
    entry,
    identity: historicalRecordFromValue(entry.file.path, entry.record),
  }));
}

export const historySchemaImmutable: VerificationRule<HistoryVerificationContext> = {
  evaluate: (context) => {
    const currentFiles = new Map(context.files.map((file) => [file.path, file]));
    return [...context.history.usedSchemaPaths].flatMap((path) => {
      const current = currentFiles.get(path)?.readBytes();
      const historical = context.history.historicalSchemaBytes.get(path);
      return current !== undefined && historical !== undefined &&
          sameBytes(current, historical) &&
          !context.history.historicalSchemaViolationPaths.has(path)
        ? []
        : [finding(path, "", "Schema used by merged core data changed or was removed")];
    });
  },
  id: "history.schema_immutable",
  prerequisites: [],
};

export const historyRecordPreserved: VerificationRule<HistoryVerificationContext> = {
  evaluate: (context) => {
    const currentByPath = new Map(
      currentRecords(context).map((record) => [record.identity.path, record.identity]),
    );
    return [...context.history.historicalPaths].flatMap(([entityKey, paths]) =>
      [...paths].flatMap((path) =>
        currentByPath.get(path)?.entityKey === entityKey
          && !context.history.historicalRecordViolationPaths.has(path)
          ? []
          : [finding(path, "", "Merged core record was removed or changed identity")]
      )
    );
  },
  id: "history.record_preserved",
  prerequisites: [],
};

function identifierPath(record: HistoricalRecord): string {
  switch (record.recordType) {
    case "source":
      return "/source_id";
    case "source_witness":
      return "/witness_id";
    case "section":
      return "/section_id";
    case "occurrence":
      return "/occurrence_id";
    case "hadith":
      return "/hadith_id";
    default:
      return "";
  }
}

export const historyIdentifierNotReused: VerificationRule<HistoryVerificationContext> = {
  evaluate: (context) => currentRecords(context).flatMap(({ identity }) => {
    const priorPaths = context.history.historicalPaths.get(identity.entityKey);
    return priorPaths === undefined || priorPaths.has(identity.path)
      ? []
      : [finding(
          identity.path,
          identifierPath(identity),
          "Identifier was previously used by a different historical record",
        )];
  }),
  id: "history.identifier_not_reused",
  prerequisites: [],
};

function sequenceFindings(
  context: HistoryVerificationContext,
  recordType: "hadith" | "occurrence",
  greatestId: number,
): readonly VerificationFindingInput[] {
  const field = recordType === "hadith" ? "/hadith_id" : "/occurrence_id";
  const records = currentRecords(context)
    .filter(({ identity }) =>
      identity.recordType === recordType &&
      !context.history.baseEntityKeys.has(identity.entityKey)
    )
    .sort((left, right) =>
      (left.identity.numericId ?? 0) - (right.identity.numericId ?? 0) ||
      (left.identity.path < right.identity.path ? -1 : 1)
    );
  return records.flatMap(({ identity }, index) =>
    identity.numericId === greatestId + index + 1
      ? []
      : [finding(
          identity.path,
          field,
          `New ${recordType} identifiers must form the next uninterrupted sequence`,
        )]
  );
}

export const historySequenceNext: VerificationRule<HistoryVerificationContext> = {
  evaluate: (context) => [
    ...sequenceFindings(context, "hadith", context.history.greatestHadithId),
    ...sequenceFindings(context, "occurrence", context.history.greatestOccurrenceId),
  ],
  id: "history.sequence_next",
  prerequisites: [],
};

export const HISTORY_RULES = Object.freeze([
  historySchemaImmutable,
  historyRecordPreserved,
  historyIdentifierNotReused,
  historySequenceNext,
]);
