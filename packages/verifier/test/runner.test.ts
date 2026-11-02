import { describe, expect, test } from "bun:test";

import {
  runVerification,
  type VerificationRule,
} from "@hadith-archive/verifier";

interface TestContext {
  readonly events: string[];
}

function rule(
  id: string,
  prerequisites: readonly string[],
  evaluate: VerificationRule<TestContext>["evaluate"],
): VerificationRule<TestContext> {
  return { evaluate, id, prerequisites };
}

describe("verification runner", () => {
  test("runs rules deterministically and blocks only failed dependents", async () => {
    const context: TestContext = { events: [] };
    const result = await runVerification(context, [
      rule("test.dependent", ["test.failure"], ({ events }) => {
        events.push("dependent");
        return [];
      }),
      rule("test.independent", ["test.success"], ({ events }) => {
        events.push("independent");
        return [];
      }),
      rule("test.failure", [], ({ events }) => {
        events.push("failure");
        return [{ file: "core/a.json", instancePath: "", message: "failed" }];
      }),
      rule("test.success", [], ({ events }) => {
        events.push("success");
        return [];
      }),
    ]);

    expect(context.events).toEqual(["failure", "success", "independent"]);
    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      expect(result.report.valid).toBe(false);
      expect(result.report.findings).toHaveLength(1);
    }
  });

  test("reports complete success when every rule passes", async () => {
    const result = await runVerification({}, [
      { evaluate: () => [], id: "test.alpha", prerequisites: [] },
      { evaluate: async () => [], id: "test.beta", prerequisites: ["test.alpha"] },
    ]);

    expect(result).toEqual({
      kind: "complete",
      report: { findings: [], valid: true, verification_version: 5 },
    });
  });

  test("rejects duplicate, unknown, and cyclic catalog entries", async () => {
    const invalidCatalogs: readonly (readonly VerificationRule<object>[])[] = [
      [
        { evaluate: () => [], id: "test.same", prerequisites: [] },
        { evaluate: () => [], id: "test.same", prerequisites: [] },
      ],
      [{ evaluate: () => [], id: "test.one", prerequisites: ["test.missing"] }],
      [
        { evaluate: () => [], id: "test.one", prerequisites: ["test.two"] },
        { evaluate: () => [], id: "test.two", prerequisites: ["test.one"] },
      ],
    ];

    for (const catalog of invalidCatalogs) {
      expect(await runVerification({}, catalog)).toEqual({
        error: {
          code: "catalog_invalid",
          message: "Verifier rule catalog is invalid",
        },
        kind: "incomplete",
      });
    }
  });

  test("turns rule exceptions into stable incomplete outcomes", async () => {
    const result = await runVerification({}, [
      {
        evaluate: () => {
          throw new Error("/private/machine/path");
        },
        id: "test.exception",
        prerequisites: [],
      },
    ]);

    expect(result).toEqual({
      error: {
        code: "rule_exception",
        message: "Verification rule test.exception could not complete",
        ruleId: "test.exception",
      },
      kind: "incomplete",
    });
  });

  test("rejects invalid rule output without leaking it into a report", async () => {
    const result = await runVerification({}, [
      {
        evaluate: () => [
          { file: "/absolute/path", instancePath: "", message: "invalid" },
        ],
        id: "test.output",
        prerequisites: [],
      },
    ]);

    expect(result).toEqual({
      error: {
        code: "rule_output_invalid",
        message: "Verification rule test.output returned invalid findings",
        ruleId: "test.output",
      },
      kind: "incomplete",
    });
  });
});
