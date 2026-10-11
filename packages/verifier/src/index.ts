export {
  presentVerificationResult,
  runVerifierCli,
  type VerificationCliIo,
  type VerificationCliWriter,
} from "./cli.ts";
export {
  createHistoryVerificationContext,
  historicalRecordFromValue,
  loadGitHistoryState,
  loadRepositorySnapshotAtCommit,
  resolveGitBase,
  type GitHistoryState,
  type HistoricalRecord,
  type HistoryVerificationContext,
} from "./history.ts";
export {
  VERIFICATION_VERSION,
  type VerificationExecutionResult,
  type VerificationExitStatus,
  type VerificationFinding,
  type VerificationFindingInput,
  type VerificationReport,
  type VerificationRule,
  type VerificationSystemError,
  type VerificationSystemErrorCode,
} from "./protocol.ts";
export {
  createVerificationFinding,
  createVerificationReport,
  isRuleId,
  serializeVerificationReport,
} from "./report.ts";
export {
  createRepositorySnapshot,
  loadRepositorySnapshot,
  type RepositoryFileInput,
  type RepositorySnapshot,
  type TrackedFile,
} from "./repository.ts";
export {
  REPOSITORY_FILE_RULES,
  fileFinalLf,
  fileLfOnly,
  fileNoBom,
  fileRegular,
  fileValidUtf8,
  jsonCanonical,
  jsonParseable,
  jsonUniqueKeys,
  repositoryPrivateMaterialAbsent,
  textNfc,
} from "./rules/file.ts";
export {
  GRAPH_RULES,
  hadithDisplayIsMember,
  hadithExtractedSpans,
  hadithNonempty,
  identifierHadithUnique,
  identifierOccurrenceUnique,
  identifierSectionUnique,
  identifierSourceUnique,
  identifierWitnessUnique,
  occurrenceOrdinalSequence,
  referenceDisplayOccurrenceResolves,
  referenceHadithResolves,
  referenceSectionResolves,
  referenceSourceResolves,
  referenceWitnessResolves,
  sectionDepthFirstOrder,
  sectionOrdinalSequence,
  sectionParentAcyclic,
  witnessSourcePrefix,
} from "./rules/graph.ts";
export {
  HISTORY_RULES,
  historyIdentifierNotReused,
  historyRecordPreserved,
  historySchemaImmutable,
  historySequenceNext,
} from "./rules/history.ts";
export {
  SEMANTIC_RULES,
  occurrenceFingerprintMatches,
  occurrenceLocationMatchesScheme,
  occurrencePageOrder,
  textRawWhitespace,
  textSingleLine,
  witnessIsbnChecksum,
} from "./rules/semantic.ts";
export {
  STRUCTURAL_RULES,
  recordPathMatches,
  recordSchemaKnown,
  recordSchemaValid,
  schemaCatalogComplete,
  schemaIdMatchesPath,
  schemaMetaValid,
  schemaReferencesExact,
} from "./rules/structural.ts";
export { runVerification } from "./runner.ts";
export {
  createStructuralVerificationContext,
  type CoreRecordCandidate,
  type StructuralVerificationContext,
  type ValidCoreRecord,
} from "./structural-context.ts";
export { verifyRepository } from "./verify.ts";
