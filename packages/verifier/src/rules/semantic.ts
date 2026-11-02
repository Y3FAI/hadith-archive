import { createHash } from "node:crypto";

import type {
  CollationRecord,
  LoadedCoreRecord,
  OccurrenceRecord,
  SourceWitnessRecord,
} from "@hadith-archive/core-loader";

import type { VerificationFindingInput, VerificationRule } from "../protocol.ts";
import { codePointGraphemeBoundaries } from "./graph.ts";
import type {
  StructuralVerificationContext,
  ValidCoreRecord,
} from "../structural-context.ts";

function finding(
  record: ValidCoreRecord,
  instancePath: string,
  message: string,
): VerificationFindingInput {
  return { file: record.file.path, instancePath, message };
}

function singleLineFields(
  record: LoadedCoreRecord,
): readonly { readonly path: string; readonly value: string }[] {
  switch (record.record_type) {
    case "source":
      return [
        { path: "/author", value: record.author },
        { path: "/title", value: record.title },
      ];
    case "source_witness":
      return [
        ...(record.edition_statement === undefined
          ? []
          : [{ path: "/edition_statement", value: record.edition_statement }]),
        { path: "/publisher", value: record.publisher },
        { path: "/title_as_printed", value: record.title_as_printed },
      ];
    case "section":
      return [{ path: "/title", value: record.title }];
    case "collation":
    case "hadith":
    case "occurrence":
      return [];
  }
}

// A hadith's text is a span of raw text, so it follows the same whitespace
// rules, including LF.
function rawWhitespaceField(
  record: LoadedCoreRecord,
): { readonly path: string; readonly value: string } | undefined {
  switch (record.record_type) {
    case "occurrence":
      return { path: "/raw_text", value: record.raw_text };
    case "hadith":
      return { path: "/text", value: record.text };
    default:
      return undefined;
  }
}

// The twelve Unicode Bidi_Control characters, then U+200B ZERO WIDTH SPACE,
// U+2060 WORD JOINER, and U+FEFF ZERO WIDTH NO-BREAK SPACE. This exact list is
// not a category ban; U+200C ZWNJ and U+200D ZWJ are deliberately absent.
const FORBIDDEN_FORMAT_CODE_POINTS = new Set([
  0x061c, 0x200e, 0x200f,
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2066, 0x2067, 0x2068, 0x2069,
  0x200b, 0x2060, 0xfeff,
]);

function hasForbiddenCharacter(value: string, allowLf: boolean): boolean {
  for (const character of value) {
    if (/\p{White_Space}/u.test(character)) {
      if (character !== " " && !(allowLf && character === "\n")) {
        return true;
      }
    }
    if (/\p{Cc}/u.test(character) && !(allowLf && character === "\n")) {
      return true;
    }
    if (FORBIDDEN_FORMAT_CODE_POINTS.has(character.codePointAt(0) as number)) {
      return true;
    }
  }
  return false;
}

export function validSingleLine(value: string): boolean {
  return value.length > 0 &&
    !value.startsWith(" ") && !value.endsWith(" ") &&
    !value.includes("  ") && !hasForbiddenCharacter(value, false);
}

function validRawWhitespace(value: string): boolean {
  return value.length > 0 &&
    !value.startsWith(" ") && !value.startsWith("\n") &&
    !value.endsWith(" ") && !value.endsWith("\n") &&
    !value.includes("  ") && !value.includes("\n\n") &&
    !value.includes(" \n") && !value.includes("\n ") &&
    !hasForbiddenCharacter(value, true);
}

// An ISBN-13 weighs its digits 1, 3, 1, ... and sums to a multiple of 10; an
// ISBN-10 weighs them 10 down to 1, with X as 10, and sums to a multiple of 11.
function validIsbn(value: string): boolean {
  if (/^\d{13}$/.test(value)) {
    const sum = [...value].reduce(
      (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
      0,
    );
    return sum % 10 === 0;
  }
  if (/^\d{9}[\dX]$/.test(value)) {
    const sum = [...value].reduce(
      (total, digit, index) => total + (digit === "X" ? 10 : Number(digit)) * (10 - index),
      0,
    );
    return sum % 11 === 0;
  }
  return false;
}

function witnessesById(
  records: readonly ValidCoreRecord[],
): ReadonlyMap<string, readonly SourceWitnessRecord[]> {
  const result = new Map<string, SourceWitnessRecord[]>();
  for (const entry of records) {
    if (entry.record.record_type === "source_witness") {
      const values = result.get(entry.record.witness_id) ?? [];
      values.push(entry.record);
      result.set(entry.record.witness_id, values);
    }
  }
  return result;
}

export const textSingleLine: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => context.validRecords.flatMap((entry) =>
    singleLineFields(entry.record).flatMap((field) =>
      validSingleLine(field.value)
        ? []
        : [finding(entry, field.path, "Value violates single-line whitespace rules")]
    )
  ),
  id: "text.single_line",
  prerequisites: [],
};

export const textRawWhitespace: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => context.validRecords.flatMap((entry) => {
    const field = rawWhitespaceField(entry.record);
    return field === undefined || validRawWhitespace(field.value)
      ? []
      : [finding(entry, field.path, "Raw text violates preserved whitespace rules")];
  }),
  id: "text.raw_whitespace",
  prerequisites: [],
};

export const witnessIsbnChecksum: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => context.validRecords.flatMap((entry) =>
    entry.record.record_type === "source_witness" && entry.record.isbn !== undefined &&
      !validIsbn(entry.record.isbn)
      ? [finding(entry, "/isbn", "ISBN checksum is invalid")]
      : []
  ),
  id: "witness.isbn_checksum",
  prerequisites: [],
};

export const occurrenceFingerprintMatches: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => context.validRecords.flatMap((entry) => {
    if (entry.record.record_type !== "occurrence") {
      return [];
    }
    const expected = createHash("sha256")
      .update(entry.record.raw_text, "utf8")
      .digest("hex");
    return entry.record.fingerprint === expected
      ? []
      : [finding(entry, "/fingerprint", "Fingerprint does not match raw_text")];
  }),
  id: "occurrence.fingerprint_matches",
  prerequisites: [],
};

// Each range of the Prophet's words lies in the raw text on grapheme
// boundaries, is nonempty, starts and ends on a character that is not
// whitespace, and comes after the one before with a gap between them.
export const occurrenceProphetWords: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => context.validRecords.flatMap((entry) => {
    if (entry.record.record_type !== "occurrence" || entry.record.prophet_words === undefined) {
      return [];
    }
    const codePoints = [...entry.record.raw_text];
    const boundaries = codePointGraphemeBoundaries(entry.record.raw_text);
    const words = entry.record.prophet_words;
    const space = (at: number) => /\p{White_Space}/u.test(codePoints[at] ?? " ");
    return words.flatMap((range, index) => {
      const previous = words[index - 1];
      const valid =
        range.start < range.end &&
        boundaries.has(range.start) && boundaries.has(range.end) &&
        !space(range.start) && !space(range.end - 1) &&
        (previous === undefined || previous.end < range.start);
      return valid
        ? []
        : [finding(entry, `/prophet_words/${index}`, "Prophet's words are not a valid range of the raw text")];
    });
  }),
  id: "occurrence.prophet_words",
  prerequisites: [],
};

// An occurrence and a collation both locate a report in their own witness.
type LocatedRecord = CollationRecord | OccurrenceRecord;
type LocatedType = LocatedRecord["record_type"];

function pageOrderRule(
  recordType: LocatedType,
): VerificationRule<StructuralVerificationContext> {
  return {
    evaluate: (context) => context.validRecords.flatMap((entry) =>
      entry.record.record_type === recordType &&
        (entry.record as LocatedRecord).location.page_end <
          (entry.record as LocatedRecord).location.page_start
        ? [finding(entry, "/location/page_end", "Ending page is less than starting page")]
        : []
    ),
    id: `${recordType}.page_order`,
    prerequisites: [],
  };
}

function locationMatchesSchemeRule(
  recordType: LocatedType,
): VerificationRule<StructuralVerificationContext> {
  return {
    evaluate: (context) => {
      const witnesses = witnessesById(context.validRecords);
      return context.validRecords.flatMap((entry) => {
        if (entry.record.record_type !== recordType) {
          return [];
        }
        const record = entry.record as LocatedRecord;
        const matches = witnesses.get(record.witness_id) ?? [];
        if (matches.length !== 1) {
          return [];
        }
        const witness = matches[0] as SourceWitnessRecord;
        const findings: VerificationFindingInput[] = [];
        for (const field of ["hadith_number", "volume"] as const) {
          const present = record.location[field] !== undefined;
          if (present !== witness.reference_scheme[field]) {
            findings.push(finding(
              entry,
              `/location/${field}`,
              `Location ${field} presence does not match witness reference scheme`,
            ));
          }
        }
        return findings;
      });
    },
    id: `${recordType}.location_matches_scheme`,
    prerequisites: [],
  };
}

export const occurrencePageOrder = pageOrderRule("occurrence");
export const occurrenceLocationMatchesScheme = locationMatchesSchemeRule("occurrence");
export const collationPageOrder = pageOrderRule("collation");
export const collationLocationMatchesScheme = locationMatchesSchemeRule("collation");

export const SEMANTIC_RULES = Object.freeze([
  textSingleLine,
  textRawWhitespace,
  witnessIsbnChecksum,
  occurrenceFingerprintMatches,
  occurrenceProphetWords,
  occurrencePageOrder,
  occurrenceLocationMatchesScheme,
  collationPageOrder,
  collationLocationMatchesScheme,
]);
