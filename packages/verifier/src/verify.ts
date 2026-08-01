import type { VerificationExecutionResult } from "./protocol.ts";
import {
  createHistoryVerificationContext,
  loadGitHistoryState,
} from "./history.ts";
import { loadRepositorySnapshot } from "./repository.ts";
import { REPOSITORY_FILE_RULES } from "./rules/file.ts";
import { GRAPH_RULES } from "./rules/graph.ts";
import { HISTORY_RULES } from "./rules/history.ts";
import { SEMANTIC_RULES } from "./rules/semantic.ts";
import { STRUCTURAL_RULES } from "./rules/structural.ts";
import { runVerification } from "./runner.ts";
import { createStructuralVerificationContext } from "./structural-context.ts";

export async function verifyRepository(
  repositoryRoot: string,
  baseReference: string,
): Promise<VerificationExecutionResult> {
  let context;
  try {
    const snapshot = await loadRepositorySnapshot(repositoryRoot);
    context = createStructuralVerificationContext(snapshot);
  } catch {
    return Object.freeze({
      error: Object.freeze({
        code: "repository_unavailable" as const,
        message: "Tracked repository files could not be read",
      }),
      kind: "incomplete" as const,
    });
  }
  try {
    const history = await loadGitHistoryState(repositoryRoot, baseReference);
    const fullContext = createHistoryVerificationContext(context, history);
    return runVerification(fullContext, [
      ...REPOSITORY_FILE_RULES,
      ...STRUCTURAL_RULES,
      ...SEMANTIC_RULES,
      ...GRAPH_RULES,
      ...HISTORY_RULES,
    ]);
  } catch {
    return Object.freeze({
      error: Object.freeze({
        code: "history_unavailable" as const,
        message: "Required Git history could not be read",
      }),
      kind: "incomplete" as const,
    });
  }
}
