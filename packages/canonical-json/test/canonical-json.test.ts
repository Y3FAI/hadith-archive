import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CanonicalJsonError,
  type CanonicalJsonErrorCode,
  type CanonicalJsonValue,
  encodeCanonicalJson,
  formatCanonicalJson,
  MAX_NESTING_DEPTH,
  parseCanonicalJsonBytes,
  parseJsonSource,
} from "../src/index.ts";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(currentDirectory, "fixtures");
const repositoryRoot = resolve(currentDirectory, "../../..");

async function readFixture(relativePath: string): Promise<Uint8Array> {
  const path = resolve(fixtureRoot, relativePath);
  if (path.endsWith(".hex")) {
    const hexadecimal = (await readFile(path, "utf8")).replaceAll(/\s/g, "");
    if (!/^(?:[0-9a-fA-F]{2})*$/.test(hexadecimal)) {
      throw new Error(`Invalid hexadecimal fixture ${relativePath}`);
    }
    return Uint8Array.from(
      hexadecimal.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
    );
  }

  return readFile(path);
}

function expectErrorCode(
  action: () => unknown,
  expectedCode: CanonicalJsonErrorCode,
): void {
  try {
    action();
    throw new Error(`Expected CanonicalJsonError ${expectedCode}`);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(CanonicalJsonError);
    expect((error as CanonicalJsonError).code).toBe(expectedCode);
  }
}

// An object holding levels - 1 nested arrays, built without recursion.
function nestedValue(levels: number): CanonicalJsonValue {
  let value: CanonicalJsonValue = [];
  for (let level = 2; level < levels; level += 1) {
    value = [value];
  }
  return { a: value };
}

// The canonical bytes of nestedValue(levels), written by hand so they can exceed
// what the formatter accepts.
function nestedSource(levels: number): string {
  const arrays = levels - 1;
  const lines = ["{"];
  if (arrays === 1) {
    lines.push('  "a": []');
  } else {
    lines.push('  "a": [');
    for (let depth = 2; depth < arrays; depth += 1) {
      lines.push(`${"  ".repeat(depth)}[`);
    }
    lines.push(`${"  ".repeat(arrays)}[]`);
    for (let depth = arrays - 1; depth >= 2; depth -= 1) {
      lines.push(`${"  ".repeat(depth)}]`);
    }
    lines.push("  ]");
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

describe("canonical JSON bytes", () => {
  test("accepts the exact canonical representation", async () => {
    const bytes = await readFixture("valid/canonical.json");
    const value = parseCanonicalJsonBytes(bytes);

    expect(value["integer"]).toBe(9007199254740993n);
    expect(encodeCanonicalJson(value)).toEqual(bytes);
  });

  test("accepts every authoritative schema byte for byte", async () => {
    const schemaRoot = resolve(repositoryRoot, "schemas");
    const entityDirectories = await readdir(schemaRoot, { withFileTypes: true });
    const schemaPaths = (
      await Promise.all(
        entityDirectories
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const directory = resolve(schemaRoot, entry.name);
            return (await readdir(directory))
              .filter((file) => file.endsWith(".json"))
              .map((file) => resolve(directory, file));
          }),
      )
    ).flat().sort();

    expect(schemaPaths).toHaveLength(7);
    for (const schemaPath of schemaPaths) {
      const bytes = await readFile(schemaPath);
      expect(() => parseCanonicalJsonBytes(bytes)).not.toThrow();
    }
  });

  const invalidFixtures = [
    ["file.valid_utf8/invalid.hex", "invalid_utf8"],
    ["file.no_bom/invalid.hex", "bom"],
    ["file.lf_only/invalid.hex", "line_ending"],
    ["file.final_lf/invalid.hex", "final_lf"],
    ["json.parseable/invalid.json", "syntax"],
    ["json.unique_keys/invalid.json", "duplicate_key"],
    ["json.canonical/invalid.json", "non_canonical"],
    ["text.nfc/invalid.json", "non_nfc"],
  ] as const;

  for (const [relativePath, code] of invalidFixtures) {
    test(`rejects the ${relativePath} fixture`, async () => {
      const bytes = await readFixture(relativePath);
      expectErrorCode(() => parseCanonicalJsonBytes(bytes), code);
    });
  }

  test("requires one top-level object", () => {
    expectErrorCode(
      () => parseCanonicalJsonBytes(new TextEncoder().encode("[]\n")),
      "top_level",
    );
  });

  test("requires exactly one final LF", () => {
    expectErrorCode(
      () => parseCanonicalJsonBytes(new TextEncoder().encode("{}\n\n")),
      "final_lf",
    );
  });

  test("rejects floating-point values", () => {
    const bytes = new TextEncoder().encode('{\n  "value": 1.5\n}\n');
    expectErrorCode(() => parseCanonicalJsonBytes(bytes), "floating_point");
  });

  test("rejects an escaped unpaired surrogate that would otherwise be canonical", () => {
    const bytes = new TextEncoder().encode('{\n  "text": "قال \\ud800"\n}\n');
    expectErrorCode(() => parseCanonicalJsonBytes(bytes), "ill_formed_unicode");
  });

  test("accepts literal supplementary characters, Arabic, and U+FFFD", () => {
    const source = '{\n  "text": "حديث 😀 \uFFFD"\n}\n';
    const bytes = new TextEncoder().encode(source);
    const value = parseCanonicalJsonBytes(bytes);

    expect(value["text"]).toBe("حديث \u{1F600} \uFFFD");
    expect(encodeCanonicalJson(value)).toEqual(bytes);
  });

  test("keeps rejecting an optionally escaped valid pair as non-canonical", () => {
    const bytes = new TextEncoder().encode('{\n  "text": "\\ud83d\\ude00"\n}\n');
    expectErrorCode(() => parseCanonicalJsonBytes(bytes), "non_canonical");
  });

  test("accepts nesting up to the limit and rejects one level deeper", () => {
    for (const levels of [2, 3, MAX_NESTING_DEPTH]) {
      expect(nestedSource(levels)).toBe(formatCanonicalJson(nestedValue(levels)));
    }
    const atLimit = new TextEncoder().encode(nestedSource(MAX_NESTING_DEPTH));
    expect(encodeCanonicalJson(parseCanonicalJsonBytes(atLimit))).toEqual(atLimit);

    const beyond = new TextEncoder().encode(nestedSource(MAX_NESTING_DEPTH + 1));
    expectErrorCode(() => parseCanonicalJsonBytes(beyond), "nesting_depth");
  });

  test("rejects very deep nesting without exhausting the call stack", () => {
    const depth = 200_000;
    const bytes = new TextEncoder().encode(
      `{"a":${"[".repeat(depth)}${"]".repeat(depth)}}\n`,
    );
    expectErrorCode(() => parseCanonicalJsonBytes(bytes), "nesting_depth");
  });
});

describe("duplicate-aware parser", () => {
  test("accepts every JSON value form and escape class", () => {
    const sources = [
      "null",
      "true",
      "false",
      "[]",
      "{}",
      ' { "array": [null, true, false], "number": -1.5e+2, "string": "\\b\\f\\n\\r\\t\\\\\\/\\\"\\u062d" } ',
    ];

    for (const source of sources) {
      expect(() => parseJsonSource(source)).not.toThrow();
    }
  });

  test("rejects malformed JSON grammar", () => {
    const sources = [
      "",
      "01",
      "[1,]",
      "[1 2]",
      "{a: 1}",
      '{"a" 1}',
      '{"a": 1} trailing',
      '"invalid \\x escape"',
      '"unescaped\nnewline"',
    ];

    for (const source of sources) {
      expectErrorCode(() => parseJsonSource(source), "syntax");
    }
  });

  test("treats escaped and literal forms of the same key as duplicates", () => {
    expectErrorCode(
      () => parseJsonSource('{"a": 1, "\\u0061": 2}'),
      "duplicate_key",
    );
  });

  test("rejects unpaired surrogates in string values and keys", () => {
    const sources = [
      '"\\ud800"',
      '"\\udfff"',
      '"\\udc00\\ud800"',
      '"\\ud83d x \\ude00"',
      '{"outer": [{"\\ud800": 1}]}',
      '{"outer": ["حديث", "\\udc00"]}',
      '"\ud800"',
      '{"\udc00": "حديث"}',
    ];

    for (const source of sources) {
      expectErrorCode(() => parseJsonSource(source), "ill_formed_unicode");
    }
  });

  test("decodes escaped and literal supplementary pairs and U+FFFD", () => {
    expect(parseJsonSource('"\\ud83d\\ude00"')).toBe("\u{1F600}");
    expect(parseJsonSource('"\\uD83D\\uDE00"')).toBe("\u{1F600}");
    expect(parseJsonSource('{"\\ud83d\\ude00": "😀 حديث"}')).toEqual({
      "\u{1F600}": "\u{1F600} حديث",
    });
    expect(parseJsonSource('"\\ufffd"')).toBe("\uFFFD");
  });

  test("preserves integer literals beyond JavaScript's safe range", () => {
    const value = parseJsonSource("9007199254740993123456789");
    expect(value).toBe(9007199254740993123456789n);
  });

  test("limits object and array nesting at the opening bracket", () => {
    const levels = Array.from(
      { length: MAX_NESTING_DEPTH + 1 },
      (_, index) => index % 2 === 0 ? '{"k":' : "[",
    );
    const closers = levels.map((opener) => opener === "[" ? "]" : "}").reverse();
    const atLimit = `${levels.slice(1).join("")}0${closers.slice(0, -1).join("")}`;
    expect(() => parseJsonSource(atLimit)).not.toThrow();

    const beyond = `${levels.join("")}0${closers.join("")}`;
    try {
      parseJsonSource(beyond);
      throw new Error("Expected CanonicalJsonError nesting_depth");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(CanonicalJsonError);
      expect((error as CanonicalJsonError).code).toBe("nesting_depth");
      expect((error as CanonicalJsonError).offset).toBe(
        levels.slice(0, -1).join("").length,
      );
    }
  });

  test("rejects very deep arrays and objects without exhausting the call stack", () => {
    const depth = 200_000;
    expectErrorCode(
      () => parseJsonSource(`${"[".repeat(depth)}${"]".repeat(depth)}`),
      "nesting_depth",
    );
    expectErrorCode(
      () => parseJsonSource(`${'{"k":'.repeat(depth)}0${"}".repeat(depth)}`),
      "nesting_depth",
    );
  });
});

describe("canonical formatter", () => {
  test("sorts nested keys while preserving array order and literal Unicode", () => {
    const value = {
      z: [2, 1],
      a: {
        z: true,
        a: "حديث",
      },
    };

    expect(formatCanonicalJson(value)).toBe(
      '{\n  "a": {\n    "a": "حديث",\n    "z": true\n  },\n  "z": [\n    2,\n    1\n  ]\n}\n',
    );
    expect(value.z).toEqual([2, 1]);
  });

  test("uses ordinary decimal notation for large integers", () => {
    expect(formatCanonicalJson({ value: 1e21 })).toBe(
      '{\n  "value": 1000000000000000000000\n}\n',
    );
  });

  test("normalizes string values to NFC", () => {
    expect(formatCanonicalJson({ text: "أ" })).toBe(
      '{\n  "text": "أ"\n}\n',
    );
  });

  test("rejects unsupported values instead of JSON.stringify coercion", () => {
    expectErrorCode(
      () => formatCanonicalJson({ value: undefined } as never),
      "unsupported_value",
    );
    expectErrorCode(
      () => formatCanonicalJson({ value: Number.NaN }),
      "floating_point",
    );
  });

  test("rejects sparse arrays and non-data properties", () => {
    const sparse = Array.from({ length: 2 }) as unknown[];
    delete sparse[0];
    expectErrorCode(
      () => formatCanonicalJson({ value: sparse } as never),
      "unsupported_value",
    );

    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => 1,
    });
    expectErrorCode(
      () => formatCanonicalJson(accessor as never),
      "unsupported_value",
    );

    expectErrorCode(
      () => formatCanonicalJson({ [Symbol("value")]: 1 } as never),
      "unsupported_value",
    );

    const namedArray: unknown[] = [];
    Object.defineProperty(namedArray, "named", {
      enumerable: true,
      value: 1,
    });
    expectErrorCode(
      () => formatCanonicalJson({ value: namedArray } as never),
      "unsupported_value",
    );
  });

  test("rejects unpaired surrogates instead of escaping or replacing them", () => {
    const values = [
      { text: "قال \ud800" },
      { text: "\udc00" },
      { outer: [{ text: "\udc00\ud800" }] },
      { outer: { "\ud800": "حديث" } },
    ];

    for (const value of values) {
      expectErrorCode(() => formatCanonicalJson(value), "ill_formed_unicode");
    }
  });

  test("keeps supplementary characters and U+FFFD literal", () => {
    expect(formatCanonicalJson({ "\u{1F600}": "حديث \u{1F600} �" })).toBe(
      '{\n  "😀": "حديث 😀 �"\n}\n',
    );
  });

  test("rejects keys that collide after NFC normalization", () => {
    expectErrorCode(
      () => formatCanonicalJson({ "é": 1, "é": 2 }),
      "duplicate_key",
    );
  });

  test("formats nesting up to the limit and rejects deeper values", () => {
    expect(formatCanonicalJson(nestedValue(MAX_NESTING_DEPTH))).toBe(
      nestedSource(MAX_NESTING_DEPTH),
    );
    expectErrorCode(
      () => formatCanonicalJson(nestedValue(MAX_NESTING_DEPTH + 1)),
      "nesting_depth",
    );
    expectErrorCode(
      () => formatCanonicalJson(nestedValue(200_000)),
      "nesting_depth",
    );
  });

  test("rejects cyclic values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expectErrorCode(
      () => formatCanonicalJson(cyclic as never),
      "unsupported_value",
    );
  });
});
