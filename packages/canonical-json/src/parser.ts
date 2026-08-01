import { CanonicalJsonError } from "./errors.ts";
import type {
  CanonicalJsonArray,
  CanonicalJsonObject,
  CanonicalJsonValue,
} from "./types.ts";

const JSON_NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const JSON_WHITESPACE = new Set(["\u0009", "\u000a", "\u000d", "\u0020"]);

function parseIntegerToken(token: string): bigint | number {
  const integer = BigInt(token);
  if (
    integer >= BigInt(Number.MIN_SAFE_INTEGER) &&
    integer <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(integer);
  }

  return integer;
}

function parseNumberToken(token: string): bigint | number {
  if (!token.includes(".") && !token.includes("e") && !token.includes("E")) {
    return parseIntegerToken(token);
  }

  const value = Number(token);
  if (!Number.isFinite(value)) {
    throw new CanonicalJsonError(
      "floating_point",
      `JSON number ${token} cannot be represented as a finite integer`,
    );
  }

  return value;
}

class Parser {
  private offset = 0;

  constructor(private readonly source: string) {}

  parseDocument(): CanonicalJsonValue {
    this.skipWhitespace();
    const value = this.parseValue();
    this.skipWhitespace();

    if (this.offset !== this.source.length) {
      this.fail("Unexpected content after the JSON value");
    }

    return value;
  }

  private current(): string | undefined {
    return this.source[this.offset];
  }

  private fail(message: string, offset = this.offset): never {
    throw new CanonicalJsonError("syntax", message, { offset });
  }

  private parseArray(): CanonicalJsonArray {
    this.offset += 1;
    this.skipWhitespace();
    const values: CanonicalJsonArray = [];

    if (this.current() === "]") {
      this.offset += 1;
      return values;
    }

    while (true) {
      values.push(this.parseValue());
      this.skipWhitespace();

      if (this.current() === "]") {
        this.offset += 1;
        return values;
      }
      if (this.current() !== ",") {
        this.fail("Expected a comma or closing bracket in array");
      }

      this.offset += 1;
      this.skipWhitespace();
    }
  }

  private parseKeyword(
    keyword: "false" | "null" | "true",
    value: boolean | null,
  ): boolean | null {
    if (!this.source.startsWith(keyword, this.offset)) {
      this.fail(`Expected ${keyword}`);
    }

    this.offset += keyword.length;
    return value;
  }

  private parseNumber(): bigint | number {
    JSON_NUMBER.lastIndex = this.offset;
    const match = JSON_NUMBER.exec(this.source);
    if (match === null) {
      this.fail("Invalid JSON number");
    }

    this.offset = JSON_NUMBER.lastIndex;
    return parseNumberToken(match[0]);
  }

  private parseObject(): CanonicalJsonObject {
    this.offset += 1;
    this.skipWhitespace();
    const object = Object.create(null) as CanonicalJsonObject;
    const keys = new Set<string>();

    if (this.current() === "}") {
      this.offset += 1;
      return object;
    }

    while (true) {
      const keyOffset = this.offset;
      if (this.current() !== '"') {
        this.fail("Expected a quoted object key");
      }

      const key = this.parseString();
      if (keys.has(key)) {
        throw new CanonicalJsonError(
          "duplicate_key",
          `Duplicate object key ${JSON.stringify(key)}`,
          { offset: keyOffset },
        );
      }
      keys.add(key);

      this.skipWhitespace();
      if (this.current() !== ":") {
        this.fail("Expected a colon after object key");
      }

      this.offset += 1;
      this.skipWhitespace();
      object[key] = this.parseValue();
      this.skipWhitespace();

      if (this.current() === "}") {
        this.offset += 1;
        return object;
      }
      if (this.current() !== ",") {
        this.fail("Expected a comma or closing brace in object");
      }

      this.offset += 1;
      this.skipWhitespace();
    }
  }

  private parseString(): string {
    const start = this.offset;
    this.offset += 1;

    while (this.offset < this.source.length) {
      const character = this.source[this.offset];
      if (character === '"') {
        this.offset += 1;
        const token = this.source.slice(start, this.offset);
        try {
          return JSON.parse(token) as string;
        } catch (error: unknown) {
          throw new CanonicalJsonError("syntax", "Invalid JSON string", {
            cause: error,
            offset: start,
          });
        }
      }

      if (character === "\\") {
        this.offset += 1;
        const escape = this.source[this.offset];
        if (escape === undefined) {
          this.fail("Unterminated escape sequence", start);
        }
        if (escape === "u") {
          const hexadecimal = this.source.slice(
            this.offset + 1,
            this.offset + 5,
          );
          if (!/^[0-9a-fA-F]{4}$/.test(hexadecimal)) {
            this.fail("Invalid Unicode escape sequence", this.offset - 1);
          }
          this.offset += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(escape)) {
          this.fail("Invalid JSON escape sequence", this.offset - 1);
        }
        this.offset += 1;
        continue;
      }

      if (character === undefined || character.charCodeAt(0) < 0x20) {
        this.fail("Unescaped control character in JSON string");
      }

      this.offset += 1;
    }

    this.fail("Unterminated JSON string", start);
  }

  private parseValue(): CanonicalJsonValue {
    const character = this.current();
    if (character === undefined) {
      this.fail("Expected a JSON value");
    }

    if (character === "{") {
      return this.parseObject();
    }
    if (character === "[") {
      return this.parseArray();
    }
    if (character === '"') {
      return this.parseString();
    }
    if (character === "t") {
      return this.parseKeyword("true", true);
    }
    if (character === "f") {
      return this.parseKeyword("false", false);
    }
    if (character === "n") {
      return this.parseKeyword("null", null);
    }
    if (character === "-" || (character >= "0" && character <= "9")) {
      return this.parseNumber();
    }

    this.fail(`Unexpected character ${JSON.stringify(character)}`);
  }

  private skipWhitespace(): void {
    while (this.current() !== undefined && JSON_WHITESPACE.has(this.current()!)) {
      this.offset += 1;
    }
  }
}

export function parseJsonSource(source: string): CanonicalJsonValue {
  return new Parser(source).parseDocument();
}
