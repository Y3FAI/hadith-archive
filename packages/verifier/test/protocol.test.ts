import { describe, expect, test } from "bun:test";

import {
  createVerificationFinding,
  createVerificationReport,
  isRuleId,
  serializeVerificationReport,
} from "@open-hadith/verifier";

describe("verification protocol", () => {
  test("accepts only stable dotted rule identifiers", () => {
    expect(isRuleId("record.schema_valid")).toBe(true);
    expect(isRuleId("history.identifier_not_reused")).toBe(true);
    expect(isRuleId("schema")).toBe(false);
    expect(isRuleId("Record.schema_valid")).toBe(false);
    expect(isRuleId("record..valid")).toBe(false);
  });

  test("constructs exact immutable findings", () => {
    const finding = createVerificationFinding("record.schema_valid", {
      file: "core/hadith/1.json",
      instancePath: "/display_occurrence_id",
      message: "display occurrence is invalid",
    });

    expect(finding).toEqual({
      file: "core/hadith/1.json",
      instance_path: "/display_occurrence_id",
      message: "display occurrence is invalid",
      rule_id: "record.schema_valid",
    });
    expect(Object.isFrozen(finding)).toBe(true);
  });

  test("rejects machine-dependent or malformed finding fields", () => {
    expect(() =>
      createVerificationFinding("record.schema_valid", {
        file: "/Users/example/core.json",
        instancePath: "",
        message: "invalid",
      })
    ).toThrow("repository-relative");
    expect(() =>
      createVerificationFinding("record.schema_valid", {
        file: "core/example.json",
        instancePath: "/bad~2pointer",
        message: "invalid",
      })
    ).toThrow("RFC 6901");
    expect(() =>
      createVerificationFinding("record.schema_valid", {
        file: "core/example.json",
        instancePath: "",
        message: "first line\nsecond line",
      })
    ).toThrow("single-line");
  });

  test("sorts findings by the settled deterministic key", () => {
    const findings = [
      createVerificationFinding("record.schema_valid", {
        file: "core/z.json",
        instancePath: "",
        message: "z",
      }),
      createVerificationFinding("json.canonical", {
        file: "core/a.json",
        instancePath: "/title",
        message: "second",
      }),
      createVerificationFinding("file.valid_utf8", {
        file: "core/a.json",
        instancePath: "",
        message: "first",
      }),
    ];

    const report = createVerificationReport(findings);
    expect(report.findings.map((finding) => finding.rule_id)).toEqual([
      "file.valid_utf8",
      "json.canonical",
      "record.schema_valid",
    ]);
    expect(report.valid).toBe(false);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.findings)).toBe(true);
  });

  test("snapshots findings instead of exposing caller-owned objects", () => {
    const input = {
      file: "core/example.json",
      instance_path: "",
      message: "failed",
      rule_id: "test.failure",
    };
    const report = createVerificationReport([input]);
    input.message = "changed";

    expect(report.findings[0]?.message).toBe("failed");
    expect(Object.isFrozen(report.findings[0])).toBe(true);
  });

  test("serializes a byte-stable canonical machine report", () => {
    const report = createVerificationReport([
      createVerificationFinding("json.canonical", {
        file: "core/example.json",
        instancePath: "",
        message: "JSON is not canonical",
      }),
    ]);

    expect(serializeVerificationReport(report)).toBe(`{
  "findings": [
    {
      "file": "core/example.json",
      "instance_path": "",
      "message": "JSON is not canonical",
      "rule_id": "json.canonical"
    }
  ],
  "valid": false,
  "verification_version": 1
}
`);
  });

  test("refuses internally inconsistent reports", () => {
    expect(() =>
      serializeVerificationReport({
        findings: [],
        valid: false,
        verification_version: 1,
      })
    ).toThrow("validity is inconsistent");
  });
});
