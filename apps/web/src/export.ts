import type {
  CollationRecord,
  OccurrenceRecord,
  SectionRecord,
  SourceRecord,
  SourceWitnessRecord,
} from "../../../packages/core-loader/src/index.ts";
import type { SiteInputs } from "./inputs.ts";
import { ROUTE } from "./render.ts";

// The one-file exports of a data release, built from the same validated
// inputs as the site. Records are copied verbatim, never rewritten.

function resolver({ core, site }: SiteInputs) {
  const witness = new Map(core.witnesses.map((record) => [record.witness_id, record]));
  const source = new Map(core.sources.map((record) => [record.source_id, record]));
  const section = new Map(core.sections.map((record) => [`${record.source_id}/${record.section_id}`, record]));
  const occurrence = new Map(core.occurrences.map((record) => [record.occurrence_id, record]));
  const collations = new Map<number, CollationRecord[]>();
  for (const record of core.collations) {
    collations.set(record.occurrence_id, [...collations.get(record.occurrence_id) ?? [], record]);
  }
  return {
    collations: (id: number) => [...collations.get(id) ?? []]
      .sort((left, right) => left.witness_id < right.witness_id ? -1 : left.witness_id > right.witness_id ? 1 : 0),
    occurrence: (id: number) => occurrence.get(id) as OccurrenceRecord,
    section: (record: OccurrenceRecord, sourceId: string): SectionRecord | undefined =>
      record.section_id === undefined ? undefined : section.get(`${sourceId}/${record.section_id}`),
    source: (id: string) => source.get(id) as SourceRecord,
    url: (hadithId: number) => `${site.url}/${ROUTE.hadith(hadithId)}`,
    witness: (id: string) => witness.get(id) as SourceWitnessRecord,
  };
}

/**
 * JSONL for programs: one line per HADITH, by identifier, holding the
 * HADITH record, its page's address, its topic, and each member OCCURRENCE
 * with the SOURCE_WITNESS, SOURCE and SECTION it cites and its COLLATIONs,
 * each with the printing it compares.
 */
export function exportJsonl(inputs: SiteInputs): string {
  const find = resolver(inputs);
  const topicOf = new Map(inputs.topics.flatMap((topic) =>
    topic.hadith_ids.map((id) => [id, { title: topic.title, topic_id: topic.topic_id }] as const)
  ));
  return [...inputs.core.hadith].sort((left, right) => left.hadith_id - right.hadith_id).map((hadith) =>
    `${JSON.stringify({
      hadith,
      url: find.url(hadith.hadith_id),
      topic: topicOf.get(hadith.hadith_id) ?? null,
      occurrences: hadith.member_occurrence_ids.map((id) => {
        const occurrence = find.occurrence(id);
        const witness = find.witness(occurrence.witness_id);
        return {
          occurrence,
          witness,
          source: find.source(witness.source_id),
          section: find.section(occurrence, witness.source_id) ?? null,
          collations: find.collations(id).map((collation) => ({
            collation,
            witness: find.witness(collation.witness_id),
          })),
        };
      }),
    })}\n`
  ).join("");
}

const CSV_COLUMNS = [
  "hadith_id", "url", "hadith_text", "topic", "occurrence_id", "source_id", "source_title", "author",
  "witness_id", "title_as_printed", "publisher", "edition_statement", "publication_year", "isbn",
  "file_sha256", "volume", "page_start", "page_end", "hadith_number", "section_title", "raw_text", "fingerprint",
] as const;

// Every field quoted (RFC 4180), so commas, quotes and the line breaks
// inside a narration stay in their cell.
const field = (value: string | number | undefined) =>
  `"${value === undefined ? "" : String(value).replaceAll("\"", "\"\"")}"`;

/**
 * CSV for spreadsheets: one row per OCCURRENCE, by HADITH and then member
 * order, with its citation. UTF-8 with a byte order mark, without which
 * Excel shows the Arabic as other characters.
 */
export function exportCsv(inputs: SiteInputs): string {
  const find = resolver(inputs);
  const topicOf = new Map(inputs.topics.flatMap((topic) => topic.hadith_ids.map((id) => [id, topic.title] as const)));
  const rows = [...inputs.core.hadith].sort((left, right) => left.hadith_id - right.hadith_id)
    .flatMap((hadith) => hadith.member_occurrence_ids.map((id) => {
      const occurrence = find.occurrence(id);
      const witness = find.witness(occurrence.witness_id);
      const source = find.source(witness.source_id);
      const { location } = occurrence;
      return [
        hadith.hadith_id, find.url(hadith.hadith_id), hadith.text, topicOf.get(hadith.hadith_id),
        occurrence.occurrence_id, source.source_id, source.title, source.author,
        witness.witness_id, witness.title_as_printed, witness.publisher, witness.edition_statement,
        witness.publication_year, witness.isbn, witness.file_sha256,
        location.volume, location.page_start, location.page_end, location.hadith_number,
        find.section(occurrence, witness.source_id)?.title, occurrence.raw_text, occurrence.fingerprint,
      ];
    }));
  return `﻿${[CSV_COLUMNS, ...rows].map((row) => `${row.map(field).join(",")}\r\n`).join("")}`;
}
