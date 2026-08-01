import type { VerificationExecutionResult } from "./protocol.ts";
import { loadRepositorySnapshot } from "./repository.ts";
import { REPOSITORY_FILE_RULES } from "./rules/file.ts";
import { runVerification } from "./runner.ts";

export async function verifyRepositoryFiles(
  repositoryRoot: string,
): Promise<VerificationExecutionResult> {
  try {
    const snapshot = await loadRepositorySnapshot(repositoryRoot);
    return runVerification(snapshot, REPOSITORY_FILE_RULES);
  } catch {
    return Object.freeze({
      error: Object.freeze({
        code: "repository_unavailable" as const,
        message: "Tracked repository files could not be read",
      }),
      kind: "incomplete" as const,
    });
  }
}
