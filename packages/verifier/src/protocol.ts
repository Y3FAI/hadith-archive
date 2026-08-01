export const VERIFICATION_VERSION = 1 as const;

export type VerificationExitStatus = 0 | 1 | 2;

export interface VerificationFinding {
  readonly file: string;
  readonly instance_path: string;
  readonly message: string;
  readonly rule_id: string;
}

export interface VerificationFindingInput {
  readonly file: string;
  readonly instancePath: string;
  readonly message: string;
}

export interface VerificationReport {
  readonly findings: readonly VerificationFinding[];
  readonly valid: boolean;
  readonly verification_version: typeof VERIFICATION_VERSION;
}

export interface VerificationRule<Context> {
  readonly evaluate:
    (context: Context) =>
      | Promise<readonly VerificationFindingInput[]>
      | readonly VerificationFindingInput[];
  readonly id: string;
  readonly prerequisites: readonly string[];
}

export type VerificationSystemErrorCode =
  | "catalog_invalid"
  | "rule_exception"
  | "rule_output_invalid";

export interface VerificationSystemError {
  readonly code: VerificationSystemErrorCode;
  readonly message: string;
  readonly ruleId?: string;
}

export type VerificationExecutionResult =
  | Readonly<{
      kind: "complete";
      report: VerificationReport;
    }>
  | Readonly<{
      error: VerificationSystemError;
      kind: "incomplete";
    }>;
