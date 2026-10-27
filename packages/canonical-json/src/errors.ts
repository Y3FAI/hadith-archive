export type CanonicalJsonErrorCode =
  | "bom"
  | "duplicate_key"
  | "final_lf"
  | "floating_point"
  | "ill_formed_unicode"
  | "invalid_utf8"
  | "line_ending"
  | "nesting_depth"
  | "non_canonical"
  | "non_nfc"
  | "syntax"
  | "top_level"
  | "unsupported_value";

export interface CanonicalJsonErrorOptions {
  cause?: unknown;
  offset?: number;
}

export class CanonicalJsonError extends Error {
  readonly code: CanonicalJsonErrorCode;
  readonly offset: number | undefined;

  constructor(
    code: CanonicalJsonErrorCode,
    message: string,
    options: CanonicalJsonErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "CanonicalJsonError";
    this.code = code;
    this.offset = options.offset;
  }
}
