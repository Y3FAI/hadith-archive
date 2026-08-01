export {
  presentVerificationResult,
  runVerifierCli,
  type VerificationCliIo,
  type VerificationCliWriter,
} from "./cli.ts";
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
  fileValidUtf8,
  jsonCanonical,
  jsonParseable,
  jsonUniqueKeys,
  repositoryPrivateMaterialAbsent,
  textNfc,
} from "./rules/file.ts";
export { runVerification } from "./runner.ts";
export { verifyRepositoryFiles } from "./verify.ts";
