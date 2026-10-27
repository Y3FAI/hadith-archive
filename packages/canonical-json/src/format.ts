import { CanonicalJsonError } from "./errors.ts";
import { MAX_NESTING_DEPTH } from "./parser.ts";
import type { CanonicalJsonValue } from "./types.ts";

const INDENT = "  ";

function expandExponentialInteger(source: string): string {
  const [mantissa = "", exponentSource = ""] = source.toLowerCase().split("e");
  const exponent = Number(exponentSource);
  const negative = mantissa.startsWith("-");
  const unsignedMantissa = negative ? mantissa.slice(1) : mantissa;
  const [integerPart = "", fractionalPart = ""] = unsignedMantissa.split(".");
  const digits = `${integerPart}${fractionalPart}`;
  const decimalPosition = integerPart.length + exponent;

  if (!Number.isSafeInteger(exponent) || decimalPosition <= 0) {
    throw new CanonicalJsonError(
      "floating_point",
      `Number ${source} is not an ordinary decimal integer`,
    );
  }

  const expanded = decimalPosition >= digits.length
    ? `${digits}${"0".repeat(decimalPosition - digits.length)}`
    : `${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;

  if (expanded.includes(".")) {
    throw new CanonicalJsonError(
      "floating_point",
      `Number ${source} is not an integer`,
    );
  }

  return negative ? `-${expanded}` : expanded;
}

function formatInteger(value: bigint | number): string {
  if (typeof value === "bigint") {
    return value.toString(10);
  }
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new CanonicalJsonError(
      "floating_point",
      "Canonical JSON permits integers only",
    );
  }
  if (Object.is(value, -0)) {
    return "0";
  }

  const source = value.toString(10);
  return source.includes("e") ? expandExponentialInteger(source) : source;
}

function formatString(value: string): string {
  if (!value.isWellFormed()) {
    throw new CanonicalJsonError(
      "ill_formed_unicode",
      "Canonical JSON strings must contain Unicode scalar values only",
    );
  }
  return JSON.stringify(value.normalize("NFC"));
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === null || prototype === Object.prototype;
}

function requireDataProperty(
  object: object,
  key: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (
    descriptor === undefined ||
    !descriptor.enumerable ||
    !("value" in descriptor)
  ) {
    throw new CanonicalJsonError(
      "unsupported_value",
      "Canonical JSON accepts enumerable data properties only",
    );
  }

  return descriptor.value as unknown;
}

function formatValue(
  value: unknown,
  depth: number,
  ancestors: Set<object>,
): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return formatString(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return formatInteger(value);
  }
  if (typeof value !== "object") {
    throw new CanonicalJsonError(
      "unsupported_value",
      `Canonical JSON cannot represent ${typeof value}`,
    );
  }
  if (ancestors.has(value)) {
    throw new CanonicalJsonError(
      "unsupported_value",
      "Canonical JSON cannot represent cyclic values",
    );
  }
  if (depth >= MAX_NESTING_DEPTH) {
    throw new CanonicalJsonError(
      "nesting_depth",
      `Canonical JSON nests at most ${MAX_NESTING_DEPTH} levels`,
    );
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const allowedKeys = new Set([
        "length",
        ...Array.from({ length: value.length }, (_, index) => String(index)),
      ]);
      if (
        Reflect.ownKeys(value).some(
          (key) => typeof key !== "string" || !allowedKeys.has(key),
        )
      ) {
        throw new CanonicalJsonError(
          "unsupported_value",
          "Canonical JSON arrays cannot carry named or symbol properties",
        );
      }
      if (value.length === 0) {
        return "[]";
      }

      const items = Array.from({ length: value.length }, (_, index) => {
        if (!Object.hasOwn(value, index)) {
          throw new CanonicalJsonError(
            "unsupported_value",
            "Canonical JSON cannot represent sparse arrays",
          );
        }
        const item = requireDataProperty(value, String(index));
        return `${INDENT.repeat(depth + 1)}${formatValue(item, depth + 1, ancestors)}`;
      });
      return `[\n${items.join(",\n")}\n${INDENT.repeat(depth)}]`;
    }
    if (!isPlainObject(value)) {
      throw new CanonicalJsonError(
        "unsupported_value",
        "Canonical JSON accepts plain objects only",
      );
    }

    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) {
      throw new CanonicalJsonError(
        "unsupported_value",
        "Canonical JSON object keys must be strings",
      );
    }
    const normalizedEntries = (ownKeys as string[]).map((key) => [
      key.normalize("NFC"),
      requireDataProperty(value, key),
    ] as const);
    normalizedEntries.sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    );

    for (let index = 1; index < normalizedEntries.length; index += 1) {
      if (normalizedEntries[index - 1]?.[0] === normalizedEntries[index]?.[0]) {
        throw new CanonicalJsonError(
          "duplicate_key",
          `Object keys collide after NFC normalization: ${JSON.stringify(normalizedEntries[index]?.[0])}`,
        );
      }
    }
    if (normalizedEntries.length === 0) {
      return "{}";
    }

    const properties = normalizedEntries.map(([key, propertyValue]) =>
      `${INDENT.repeat(depth + 1)}${formatString(key)}: ${formatValue(propertyValue, depth + 1, ancestors)}`
    );
    return `{\n${properties.join(",\n")}\n${INDENT.repeat(depth)}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function formatCanonicalJson(value: CanonicalJsonValue): string {
  return `${formatValue(value, 0, new Set<object>())}\n`;
}
