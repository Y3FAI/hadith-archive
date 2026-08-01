import {
  type VerificationExecutionResult,
  type VerificationFinding,
  type VerificationRule,
  type VerificationSystemError,
  type VerificationSystemErrorCode,
} from "./protocol.ts";
import {
  createVerificationFinding,
  createVerificationReport,
  isRuleId,
} from "./report.ts";

type RuleStatus = "blocked" | "failed" | "passed";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createSystemError(
  code: VerificationSystemErrorCode,
  message: string,
  ruleId?: string,
): VerificationExecutionResult {
  const error: VerificationSystemError = Object.freeze({
    code,
    message,
    ...(ruleId === undefined ? {} : { ruleId }),
  });
  return Object.freeze({ error, kind: "incomplete" });
}

function orderRules<Context>(
  rules: readonly VerificationRule<Context>[],
): readonly VerificationRule<Context>[] {
  const byId = new Map<string, VerificationRule<Context>>();
  for (const rule of rules) {
    if (!isRuleId(rule.id)) {
      throw new Error("Rule catalog contains an invalid identifier");
    }
    if (byId.has(rule.id)) {
      throw new Error("Rule catalog contains a duplicate identifier");
    }
    if (new Set(rule.prerequisites).size !== rule.prerequisites.length) {
      throw new Error("Rule catalog contains a duplicate prerequisite");
    }
    byId.set(rule.id, rule);
  }

  const dependents = new Map<string, string[]>();
  const remainingPrerequisites = new Map<string, number>();
  for (const rule of rules) {
    remainingPrerequisites.set(rule.id, rule.prerequisites.length);
    for (const prerequisite of rule.prerequisites) {
      if (!byId.has(prerequisite) || prerequisite === rule.id) {
        throw new Error("Rule catalog contains an invalid prerequisite");
      }
      const entries = dependents.get(prerequisite) ?? [];
      entries.push(rule.id);
      dependents.set(prerequisite, entries);
    }
  }

  const ready = rules
    .filter((rule) => rule.prerequisites.length === 0)
    .map((rule) => rule.id)
    .sort(compareText);
  const ordered: VerificationRule<Context>[] = [];

  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) {
      break;
    }
    const rule = byId.get(id);
    if (rule === undefined) {
      throw new Error("Rule catalog changed during ordering");
    }
    ordered.push(rule);

    for (const dependent of (dependents.get(id) ?? []).sort(compareText)) {
      const remaining = (remainingPrerequisites.get(dependent) ?? 0) - 1;
      remainingPrerequisites.set(dependent, remaining);
      if (remaining === 0) {
        ready.push(dependent);
        ready.sort(compareText);
      }
    }
  }

  if (ordered.length !== rules.length) {
    throw new Error("Rule catalog contains a prerequisite cycle");
  }
  return Object.freeze(ordered);
}

export async function runVerification<Context>(
  context: Context,
  rules: readonly VerificationRule<Context>[],
): Promise<VerificationExecutionResult> {
  let orderedRules: readonly VerificationRule<Context>[];
  try {
    orderedRules = orderRules(rules);
  } catch {
    return createSystemError(
      "catalog_invalid",
      "Verifier rule catalog is invalid",
    );
  }

  const findings: VerificationFinding[] = [];
  const statuses = new Map<string, RuleStatus>();

  for (const rule of orderedRules) {
    if (
      rule.prerequisites.some(
        (prerequisite) => statuses.get(prerequisite) !== "passed",
      )
    ) {
      statuses.set(rule.id, "blocked");
      continue;
    }

    let outputs;
    try {
      outputs = await rule.evaluate(context);
    } catch {
      return createSystemError(
        "rule_exception",
        `Verification rule ${rule.id} could not complete`,
        rule.id,
      );
    }

    if (!Array.isArray(outputs)) {
      return createSystemError(
        "rule_output_invalid",
        `Verification rule ${rule.id} returned invalid findings`,
        rule.id,
      );
    }

    let ruleFindings: VerificationFinding[];
    try {
      ruleFindings = outputs.map((output) =>
        createVerificationFinding(rule.id, output)
      );
    } catch {
      return createSystemError(
        "rule_output_invalid",
        `Verification rule ${rule.id} returned invalid findings`,
        rule.id,
      );
    }

    findings.push(...ruleFindings);
    statuses.set(rule.id, ruleFindings.length === 0 ? "passed" : "failed");
  }

  return Object.freeze({
    kind: "complete",
    report: createVerificationReport(findings),
  });
}
