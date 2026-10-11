import { createHash } from "node:crypto";

import type {
  OccurrenceRecord,
  OpenHadithRecord,
  SourceWitnessRecord,
} from "@open-hadith/core-loader";

import type { VerificationFindingInput, VerificationRule } from "../protocol.ts";
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
  record: OpenHadithRecord,
): readonly { readonly path: string; readonly value: string }[] {
  switch (record.record_type) {
    case "source":
      return [
        { path: "/author", value: record.author },
        { path: "/title", value: record.title },
      ];
    case "source_witness":
      return [
        { path: "/edition_statement", value: record.edition_statement },
        { path: "/publisher", value: record.publisher },
        { path: "/title_as_printed", value: record.title_as_printed },
      ];
    case "section":
      return [{ path: "/title", value: record.title }];
    case "hadith":
      return [
        { path: "/description", value: record.description },
        { path: "/heading", value: record.heading },
        { path: "/title", value: record.title },
      ];
    case "occurrence":
      return [];
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

function validSingleLine(value: string): boolean {
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

function validIsbn13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) {
    return false;
  }
  const sum = [...value].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return sum % 10 === 0;
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
  evaluate: (context) => context.validRecords.flatMap((entry) =>
    entry.record.record_type === "occurrence" &&
      !validRawWhitespace(entry.record.raw_text)
      ? [finding(entry, "/raw_text", "Raw text violates preserved whitespace rules")]
      : []
  ),
  id: "text.raw_whitespace",
  prerequisites: [],
};

export const witnessIsbnChecksum: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => context.validRecords.flatMap((entry) =>
    entry.record.record_type === "source_witness" && !validIsbn13(entry.record.isbn)
      ? [finding(entry, "/isbn", "ISBN-13 checksum is invalid")]
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

export const occurrencePageOrder: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => context.validRecords.flatMap((entry) =>
    entry.record.record_type === "occurrence" &&
      entry.record.location.page_end < entry.record.location.page_start
      ? [finding(entry, "/location/page_end", "Ending page is less than starting page")]
      : []
  ),
  id: "occurrence.page_order",
  prerequisites: [],
};

export const occurrenceLocationMatchesScheme: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => {
    const witnesses = witnessesById(context.validRecords);
    return context.validRecords.flatMap((entry) => {
      if (entry.record.record_type !== "occurrence") {
        return [];
      }
      const matches = witnesses.get(entry.record.witness_id) ?? [];
      if (matches.length !== 1) {
        return [];
      }
      const witness = matches[0] as SourceWitnessRecord;
      const occurrence = entry.record as OccurrenceRecord;
      const findings: VerificationFindingInput[] = [];
      for (const field of ["hadith_number", "volume"] as const) {
        const present = occurrence.location[field] !== undefined;
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
  id: "occurrence.location_matches_scheme",
  prerequisites: [],
};

export const SEMANTIC_RULES = Object.freeze([
  textSingleLine,
  textRawWhitespace,
  witnessIsbnChecksum,
  occurrenceFingerprintMatches,
  occurrencePageOrder,
  occurrenceLocationMatchesScheme,
]);
