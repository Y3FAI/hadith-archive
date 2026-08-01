import { describe, expect, test } from "bun:test";

import {
  createVerificationFinding,
  createVerificationReport,
  presentVerificationResult,
  runVerifierCli,
  type VerificationCliIo,
} from "@open-hadith/verifier";

function memoryIo(): VerificationCliIo & {
  readonly errors: string[];
  readonly output: string[];
} {
  const errors: string[] = [];
  const output: string[] = [];
  return {
    errors,
    output,
    stderr: { write: (text) => errors.push(text) },
    stdout: { write: (text) => output.push(text) },
  };
}

describe("verification CLI boundary", () => {
  test("writes complete reports and maps valid and invalid states", () => {
    const validIo = memoryIo();
    expect(
      presentVerificationResult(
        { kind: "complete", report: createVerificationReport([]) },
        validIo,
      ),
    ).toBe(0);
    expect(validIo.errors).toEqual([]);
    expect(validIo.output.join("")).toContain('"valid": true');

    const invalidIo = memoryIo();
    const report = createVerificationReport([
      createVerificationFinding("test.failure", {
        file: "core/example.json",
        instancePath: "",
        message: "failed",
      }),
    ]);
    expect(presentVerificationResult({ kind: "complete", report }, invalidIo)).toBe(1);
    expect(invalidIo.errors).toEqual([]);
    expect(invalidIo.output.join("")).toContain('"valid": false');
  });

  test("writes stable system errors and maps incomplete execution to two", () => {
    const io = memoryIo();
    const status = presentVerificationResult(
      {
        error: {
          code: "catalog_invalid",
          message: "Verifier rule catalog is invalid",
        },
        kind: "incomplete",
      },
      io,
    );

    expect(status).toBe(2);
    expect(io.output).toEqual([]);
    expect(io.errors).toEqual(["Verifier rule catalog is invalid\n"]);
  });

  test("contains unexpected top-level exceptions", async () => {
    const io = memoryIo();
    const status = await runVerifierCli(async () => {
      throw new Error("machine-specific detail");
    }, io);

    expect(status).toBe(2);
    expect(io.output).toEqual([]);
    expect(io.errors).toEqual(["Verification could not complete\n"]);
  });
});
