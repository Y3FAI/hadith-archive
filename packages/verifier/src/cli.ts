import {
  type VerificationExecutionResult,
  type VerificationExitStatus,
} from "./protocol.ts";
import { serializeVerificationReport } from "./report.ts";

export interface VerificationCliWriter {
  write(text: string): unknown;
}

export interface VerificationCliIo {
  readonly stderr: VerificationCliWriter;
  readonly stdout: VerificationCliWriter;
}

const INTERNAL_FAILURE_MESSAGE = "Verification could not complete\n";

export function presentVerificationResult(
  result: VerificationExecutionResult,
  io: VerificationCliIo,
): VerificationExitStatus {
  if (result.kind === "incomplete") {
    io.stderr.write(`${result.error.message}\n`);
    return 2;
  }

  io.stdout.write(serializeVerificationReport(result.report));
  return result.report.valid ? 0 : 1;
}

export async function runVerifierCli(
  execute: () => Promise<VerificationExecutionResult>,
  io: VerificationCliIo = process,
): Promise<VerificationExitStatus> {
  try {
    return presentVerificationResult(await execute(), io);
  } catch {
    io.stderr.write(INTERNAL_FAILURE_MESSAGE);
    return 2;
  }
}
