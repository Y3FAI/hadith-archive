import { formatCanonicalJson } from "@hadith-archive/canonical-json";

import {
  VERIFICATION_VERSION,
  type VerificationFinding,
  type VerificationFindingInput,
  type VerificationReport,
} from "./protocol.ts";

const RULE_ID_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const JSON_POINTER_PATTERN = /^(?:\/(?:[^~]|~[01])*)*$/u;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareFindings(
  left: VerificationFinding,
  right: VerificationFinding,
): number {
  return (
    compareText(left.file, right.file) ||
    compareText(left.instance_path, right.instance_path) ||
    compareText(left.rule_id, right.rule_id) ||
    compareText(left.message, right.message)
  );
}

export function isRuleId(value: string): boolean {
  return RULE_ID_PATTERN.test(value);
}

function isRepositoryRelativePath(value: string): boolean {
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value !== value.normalize("NFC")
  ) {
    return false;
  }

  return value.split("/").every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

function requireFindingInput(
  ruleId: string,
  input: VerificationFindingInput,
): VerificationFinding {
  if (!isRepositoryRelativePath(input.file)) {
    throw new Error("Verification finding file must be repository-relative");
  }
  if (!JSON_POINTER_PATTERN.test(input.instancePath)) {
    throw new Error("Verification finding instance path must be an RFC 6901 JSON Pointer");
  }
  if (
    input.message.length === 0 ||
    input.message.includes("\n") ||
    input.message.includes("\r") ||
    input.message !== input.message.normalize("NFC")
  ) {
    throw new Error("Verification finding message must be nonempty single-line NFC text");
  }

  return Object.freeze({
    file: input.file,
    instance_path: input.instancePath,
    message: input.message,
    rule_id: ruleId,
  });
}

export function createVerificationFinding(
  ruleId: string,
  input: VerificationFindingInput,
): VerificationFinding {
  if (!isRuleId(ruleId)) {
    throw new Error(`Invalid verification rule identifier: ${ruleId}`);
  }
  return requireFindingInput(ruleId, input);
}

export function createVerificationReport(
  findings: readonly VerificationFinding[],
): VerificationReport {
  const sortedFindings = Object.freeze(
    findings
      .map((finding) =>
        createVerificationFinding(finding.rule_id, {
          file: finding.file,
          instancePath: finding.instance_path,
          message: finding.message,
        })
      )
      .sort(compareFindings),
  );
  return Object.freeze({
    findings: sortedFindings,
    valid: sortedFindings.length === 0,
    verification_version: VERIFICATION_VERSION,
  });
}

export function serializeVerificationReport(
  report: VerificationReport,
): string {
  if (report.verification_version !== VERIFICATION_VERSION) {
    throw new Error("Verification report version is unsupported");
  }
  const normalized = createVerificationReport(report.findings);
  if (normalized.valid !== report.valid) {
    throw new Error("Verification report validity is inconsistent with its findings");
  }

  return formatCanonicalJson({
    findings: normalized.findings.map((finding) => ({
      file: finding.file,
      instance_path: finding.instance_path,
      message: finding.message,
      rule_id: finding.rule_id,
    })),
    valid: normalized.valid,
    verification_version: normalized.verification_version,
  });
}
