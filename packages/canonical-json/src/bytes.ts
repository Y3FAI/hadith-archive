import { CanonicalJsonError } from "./errors.ts";
import { formatCanonicalJson } from "./format.ts";
import { parseJsonSource } from "./parser.ts";
import {
  isCanonicalJsonObject,
  type CanonicalJsonObject,
  type CanonicalJsonValue,
} from "./types.ts";

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();

function hasBom(bytes: Uint8Array): boolean {
  return UTF8_BOM.every((byte, index) => bytes[index] === byte);
}

function assertNfc(value: CanonicalJsonValue): void {
  if (typeof value === "string") {
    if (value !== value.normalize("NFC")) {
      throw new CanonicalJsonError(
        "non_nfc",
        "Canonical JSON string values must be NFC",
      );
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNfc(item);
    }
    return;
  }

  for (const [key, propertyValue] of Object.entries(value)) {
    if (key !== key.normalize("NFC")) {
      throw new CanonicalJsonError(
        "non_nfc",
        "Canonical JSON object keys must be NFC",
      );
    }
    assertNfc(propertyValue);
  }
}

export function decodeUtf8(bytes: Uint8Array): string {
  let source: string;
  try {
    source = decoder.decode(bytes);
  } catch (error: unknown) {
    throw new CanonicalJsonError("invalid_utf8", "Input is not valid UTF-8", {
      cause: error,
    });
  }

  if (hasBom(bytes)) {
    throw new CanonicalJsonError("bom", "UTF-8 BOM is forbidden");
  }
  return source;
}

export function encodeCanonicalJson(value: CanonicalJsonValue): Uint8Array {
  return encoder.encode(formatCanonicalJson(value));
}

export function parseJsonBytes(bytes: Uint8Array): CanonicalJsonValue {
  return parseJsonSource(decodeUtf8(bytes));
}

export function parseCanonicalJsonBytes(
  bytes: Uint8Array,
): CanonicalJsonObject {
  const source = decodeUtf8(bytes);
  if (source.includes("\r")) {
    throw new CanonicalJsonError(
      "line_ending",
      "Canonical JSON uses LF line endings only",
    );
  }
  if (!source.endsWith("\n") || source.endsWith("\n\n")) {
    throw new CanonicalJsonError(
      "final_lf",
      "Canonical JSON ends with exactly one LF",
    );
  }

  const value = parseJsonSource(source);
  if (!isCanonicalJsonObject(value)) {
    throw new CanonicalJsonError(
      "top_level",
      "A canonical core JSON file contains one top-level object",
    );
  }
  assertNfc(value);

  const canonicalSource = formatCanonicalJson(value);
  if (source !== canonicalSource) {
    throw new CanonicalJsonError(
      "non_canonical",
      "JSON bytes do not match the canonical representation",
    );
  }

  return value;
}
