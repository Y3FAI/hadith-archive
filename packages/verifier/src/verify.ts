import type { VerificationExecutionResult } from "./protocol.ts";
import { loadRepositorySnapshot } from "./repository.ts";
import { REPOSITORY_FILE_RULES } from "./rules/file.ts";
import { STRUCTURAL_RULES } from "./rules/structural.ts";
import { runVerification } from "./runner.ts";
import { createStructuralVerificationContext } from "./structural-context.ts";

export async function verifyRepository(
  repositoryRoot: string,
): Promise<VerificationExecutionResult> {
  try {
    const snapshot = await loadRepositorySnapshot(repositoryRoot);
    const context = createStructuralVerificationContext(snapshot);
    return runVerification(context, [...REPOSITORY_FILE_RULES, ...STRUCTURAL_RULES]);
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

export const verifyRepositoryFiles = verifyRepository;
