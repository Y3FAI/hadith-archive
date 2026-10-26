import type {
  HadithRecord,
  OccurrenceRecord,
  SectionRecord,
  SourceWitnessRecord,
} from "@open-hadith/core-loader";

import type { VerificationFindingInput, VerificationRule } from "../protocol.ts";
import type {
  StructuralVerificationContext,
  ValidCoreRecord,
} from "../structural-context.ts";

function finding(
  entry: ValidCoreRecord,
  instancePath: string,
  message: string,
): VerificationFindingInput {
  return { file: entry.file.path, instancePath, message };
}

function entriesOf(
  context: StructuralVerificationContext,
  type: string,
): readonly ValidCoreRecord[] {
  return context.validRecords.filter((entry) => entry.record.record_type === type);
}

function indexBy(
  entries: readonly ValidCoreRecord[],
  key: (entry: ValidCoreRecord) => string,
): ReadonlyMap<string, readonly ValidCoreRecord[]> {
  const index = new Map<string, ValidCoreRecord[]>();
  for (const entry of entries) {
    const value = key(entry);
    const group = index.get(value) ?? [];
    group.push(entry);
    index.set(value, group);
  }
  return index;
}

function duplicateFindings(
  entries: readonly ValidCoreRecord[],
  key: (entry: ValidCoreRecord) => string,
  instancePath: string,
  message: string,
): readonly VerificationFindingInput[] {
  return [...indexBy(entries, key).values()].flatMap((group) =>
    group.length > 1
      ? group.map((entry) => finding(entry, instancePath, message))
      : []
  );
}

function sequenceFindings(
  entries: readonly ValidCoreRecord[],
  groupKey: (entry: ValidCoreRecord) => string,
  ordinal: (entry: ValidCoreRecord) => number,
  message: string,
): readonly VerificationFindingInput[] {
  return [...indexBy(entries, groupKey).values()].flatMap((group) =>
    [...group]
      .sort((left, right) =>
        ordinal(left) - ordinal(right) ||
        (left.file.path < right.file.path ? -1 : left.file.path > right.file.path ? 1 : 0)
      )
      .flatMap((entry, index) =>
        ordinal(entry) === index + 1 ? [] : [finding(entry, "/ordinal", message)]
      )
  );
}

export const identifierSourceUnique: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => duplicateFindings(
    entriesOf(context, "source"),
    (entry) => String(entry.record.record_type === "source" && entry.record.source_id),
    "/source_id",
    "Source identifier is not globally unique",
  ),
  id: "identifier.source_unique",
  prerequisites: [],
};

export const identifierWitnessUnique: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => duplicateFindings(
    entriesOf(context, "source_witness"),
    (entry) => String(
      entry.record.record_type === "source_witness" && entry.record.witness_id,
    ),
    "/witness_id",
    "Witness identifier is not globally unique",
  ),
  id: "identifier.witness_unique",
  prerequisites: [],
};

export const identifierSectionUnique: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => duplicateFindings(
    entriesOf(context, "section"),
    (entry) => entry.record.record_type === "section"
      ? `${entry.record.source_id}\0${entry.record.section_id}`
      : "",
    "/section_id",
    "Section identifier is not unique within its source",
  ),
  id: "identifier.section_unique",
  prerequisites: [],
};

export const identifierOccurrenceUnique: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => duplicateFindings(
    entriesOf(context, "occurrence"),
    (entry) => String(
      entry.record.record_type === "occurrence" && entry.record.occurrence_id,
    ),
    "/occurrence_id",
    "Occurrence identifier is not globally unique",
  ),
  id: "identifier.occurrence_unique",
  prerequisites: [],
};

export const identifierHadithUnique: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => duplicateFindings(
    entriesOf(context, "hadith"),
    (entry) => String(entry.record.record_type === "hadith" && entry.record.hadith_id),
    "/hadith_id",
    "Hadith identifier is not globally unique",
  ),
  id: "identifier.hadith_unique",
  prerequisites: [],
};

export const witnessSourcePrefix: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => entriesOf(context, "source_witness").flatMap((entry) => {
    const record = entry.record as SourceWitnessRecord;
    return record.witness_id.startsWith(`${record.source_id}-`)
      ? []
      : [finding(entry, "/witness_id", "Witness identifier must begin with source_id")];
  }),
  id: "witness.source_prefix",
  prerequisites: [],
};

export const sectionOrdinalSequence: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => sequenceFindings(
    entriesOf(context, "section"),
    (entry) => (entry.record as SectionRecord).source_id,
    (entry) => (entry.record as SectionRecord).ordinal,
    "Section ordinals must form the sequence 1..N within the source",
  ),
  id: "section.ordinal_sequence",
  prerequisites: [],
};

export const occurrenceOrdinalSequence: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => sequenceFindings(
    entriesOf(context, "occurrence"),
    (entry) => (entry.record as OccurrenceRecord).witness_id,
    (entry) => (entry.record as OccurrenceRecord).ordinal,
    "Occurrence ordinals must form the sequence 1..N within the witness",
  ),
  id: "occurrence.ordinal_sequence",
  prerequisites: [],
};

export const referenceSourceResolves: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => {
    const sources = indexBy(entriesOf(context, "source"), (entry) =>
      String(entry.record.record_type === "source" && entry.record.source_id)
    );
    return context.validRecords.flatMap((entry) => {
      if (entry.record.record_type !== "source_witness" && entry.record.record_type !== "section") {
        return [];
      }
      return sources.get(entry.record.source_id)?.length === 1
        ? []
        : [finding(entry, "/source_id", "Referenced source does not resolve uniquely")];
    });
  },
  id: "reference.source_resolves",
  prerequisites: [],
};

export const referenceWitnessResolves: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => {
    const witnesses = indexBy(entriesOf(context, "source_witness"), (entry) =>
      (entry.record as SourceWitnessRecord).witness_id
    );
    return entriesOf(context, "occurrence").flatMap((entry) =>
      witnesses.get((entry.record as OccurrenceRecord).witness_id)?.length === 1
        ? []
        : [finding(entry, "/witness_id", "Referenced witness does not resolve uniquely")]
    );
  },
  id: "reference.witness_resolves",
  prerequisites: [],
};

export const referenceSectionResolves: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => {
    const sections = indexBy(entriesOf(context, "section"), (entry) => {
      const record = entry.record as SectionRecord;
      return `${record.source_id}\0${record.section_id}`;
    });
    const witnesses = indexBy(entriesOf(context, "source_witness"), (entry) =>
      (entry.record as SourceWitnessRecord).witness_id
    );
    const findings: VerificationFindingInput[] = [];
    for (const entry of entriesOf(context, "section")) {
      const record = entry.record as SectionRecord;
      if (
        record.parent_section_id !== undefined &&
        sections.get(`${record.source_id}\0${record.parent_section_id}`)?.length !== 1
      ) {
        findings.push(finding(entry, "/parent_section_id", "Parent section does not resolve uniquely"));
      }
    }
    for (const entry of entriesOf(context, "occurrence")) {
      const record = entry.record as OccurrenceRecord;
      if (record.section_id === undefined) {
        continue;
      }
      const witnessGroup = witnesses.get(record.witness_id) ?? [];
      if (witnessGroup.length !== 1) {
        continue;
      }
      const witness = witnessGroup[0]?.record as SourceWitnessRecord;
      if (sections.get(`${witness.source_id}\0${record.section_id}`)?.length !== 1) {
        findings.push(finding(entry, "/section_id", "Referenced section does not resolve uniquely"));
      }
    }
    return findings;
  },
  id: "reference.section_resolves",
  prerequisites: [],
};

export const referenceHadithResolves: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => {
    const hadith = indexBy(entriesOf(context, "hadith"), (entry) =>
      String((entry.record as HadithRecord).hadith_id)
    );
    return entriesOf(context, "occurrence").flatMap((entry) => {
      const record = entry.record as OccurrenceRecord;
      return record.hadith_id === undefined || hadith.get(String(record.hadith_id))?.length === 1
        ? []
        : [finding(entry, "/hadith_id", "Referenced hadith does not resolve uniquely")];
    });
  },
  id: "reference.hadith_resolves",
  prerequisites: [],
};

export const referenceDisplayOccurrenceResolves: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => {
    const occurrences = indexBy(entriesOf(context, "occurrence"), (entry) =>
      String((entry.record as OccurrenceRecord).occurrence_id)
    );
    return entriesOf(context, "hadith").flatMap((entry) =>
      occurrences.get(String((entry.record as HadithRecord).display_occurrence_id))?.length === 1
        ? []
        : [finding(
            entry,
            "/display_occurrence_id",
            "Display occurrence does not resolve uniquely",
          )]
    );
  },
  id: "reference.display_occurrence_resolves",
  prerequisites: [],
};

function uniqueSectionsBySource(
  context: StructuralVerificationContext,
): ReadonlyMap<string, ReadonlyMap<string, ValidCoreRecord>> {
  const grouped = indexBy(entriesOf(context, "section"), (entry) =>
    (entry.record as SectionRecord).source_id
  );
  const result = new Map<string, ReadonlyMap<string, ValidCoreRecord>>();
  for (const [sourceId, entries] of grouped) {
    const byId = indexBy(entries, (entry) => (entry.record as SectionRecord).section_id);
    if ([...byId.values()].some((group) => group.length !== 1)) {
      continue;
    }
    result.set(sourceId, new Map(
      [...byId].map(([id, group]) => [id, group[0] as ValidCoreRecord]),
    ));
  }
  return result;
}

function cycleIdsForSections(
  sections: ReadonlyMap<string, ValidCoreRecord>,
): ReadonlySet<string> {
  const cycleIds = new Set<string>();
  for (const startId of sections.keys()) {
    const path: string[] = [];
    const positions = new Map<string, number>();
    let current: string | undefined = startId;
    while (current !== undefined && sections.has(current)) {
      const prior = positions.get(current);
      if (prior !== undefined) {
        for (const id of path.slice(prior)) {
          cycleIds.add(id);
        }
        break;
      }
      positions.set(current, path.length);
      path.push(current);
      current = (sections.get(current)?.record as SectionRecord).parent_section_id;
    }
  }
  return cycleIds;
}

export const sectionParentAcyclic: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => {
    const findings: VerificationFindingInput[] = [];
    for (const sections of uniqueSectionsBySource(context).values()) {
      for (const id of cycleIdsForSections(sections)) {
        const entry = sections.get(id);
        if (entry !== undefined) {
          findings.push(finding(entry, "/parent_section_id", "Section parent graph contains a cycle"));
        }
      }
    }
    return findings;
  },
  id: "section.parent_acyclic",
  prerequisites: [],
};

function descendantsOf(
  sectionId: string,
  sections: ReadonlyMap<string, ValidCoreRecord>,
): ReadonlySet<string> {
  const descendants = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, entry] of sections) {
      const parent = (entry.record as SectionRecord).parent_section_id;
      if (parent === sectionId || (parent !== undefined && descendants.has(parent))) {
        if (!descendants.has(id)) {
          descendants.add(id);
          changed = true;
        }
      }
    }
  }
  return descendants;
}

export const sectionDepthFirstOrder: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => {
    const findings: VerificationFindingInput[] = [];
    for (const sections of uniqueSectionsBySource(context).values()) {
      if (cycleIdsForSections(sections).size > 0) {
        continue;
      }
      if ([...sections.values()].some((entry) => {
        const parent = (entry.record as SectionRecord).parent_section_id;
        return parent !== undefined && !sections.has(parent);
      })) {
        continue;
      }
      const ordered = [...sections.values()].sort(
        (left, right) =>
          (left.record as SectionRecord).ordinal - (right.record as SectionRecord).ordinal,
      );
      const positions = new Map(ordered.map((entry, index) => [
        (entry.record as SectionRecord).section_id,
        index,
      ]));
      for (const entry of ordered) {
        const record = entry.record as SectionRecord;
        const descendants = descendantsOf(record.section_id, sections);
        const ownPosition = positions.get(record.section_id) as number;
        const descendantPositions = [...descendants].map((id) => positions.get(id) as number);
        const parentAfterChild = descendantPositions.some((position) => position <= ownPosition);
        const maximum = Math.max(ownPosition, ...descendantPositions);
        const contiguous = ordered.slice(ownPosition + 1, maximum + 1).every((candidate) =>
          descendants.has((candidate.record as SectionRecord).section_id)
        );
        if (parentAfterChild || !contiguous) {
          findings.push(finding(entry, "/ordinal", "Section order is not depth-first contiguous"));
        }
      }
    }
    return findings;
  },
  id: "section.depth_first_order",
  prerequisites: [],
};

export const hadithNonempty: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => {
    const members = indexBy(entriesOf(context, "occurrence"), (entry) => {
      const id = (entry.record as OccurrenceRecord).hadith_id;
      return id === undefined ? "" : String(id);
    });
    return entriesOf(context, "hadith").flatMap((entry) =>
      (members.get(String((entry.record as HadithRecord).hadith_id)) ?? []).length > 0
        ? []
        : [finding(entry, "/hadith_id", "Hadith has no occurrence members")]
    );
  },
  id: "hadith.nonempty",
  prerequisites: [],
};

function occurrenceIndex(context: StructuralVerificationContext) {
  return indexBy(entriesOf(context, "occurrence"), (entry) =>
    String((entry.record as OccurrenceRecord).occurrence_id)
  );
}

export const hadithDisplayIsMember: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => {
    const occurrences = occurrenceIndex(context);
    return entriesOf(context, "hadith").flatMap((entry) => {
      const record = entry.record as HadithRecord;
      const displayed = occurrences.get(String(record.display_occurrence_id)) ?? [];
      if (displayed.length !== 1) {
        return [];
      }
      return (displayed[0]?.record as OccurrenceRecord).hadith_id === record.hadith_id
        ? []
        : [finding(entry, "/display_occurrence_id", "Display occurrence is not a hadith member")];
    });
  },
  id: "hadith.display_is_member",
  prerequisites: [],
};

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemeBoundaries(text: string): ReadonlySet<number> {
  const boundaries = new Set<number>([text.length]);
  for (const { index } of graphemes.segment(text)) {
    boundaries.add(index);
  }
  return boundaries;
}

// Any exact occurrence may qualify, so a match that splits a cluster does not
// hide a later one, including one that overlaps it.
function containsGraphemeSpan(
  text: string,
  boundaries: ReadonlySet<number>,
  span: string,
): boolean {
  for (let start = text.indexOf(span); start !== -1; start = text.indexOf(span, start + 1)) {
    if (boundaries.has(start) && boundaries.has(start + span.length)) {
      return true;
    }
  }
  return false;
}

export const hadithExtractedSpans: VerificationRule<StructuralVerificationContext> = {
  evaluate: (context) => {
    const occurrences = occurrenceIndex(context);
    return entriesOf(context, "hadith").flatMap((entry) => {
      const record = entry.record as HadithRecord;
      const displayed = occurrences.get(String(record.display_occurrence_id)) ?? [];
      if (displayed.length !== 1) {
        return [];
      }
      const rawText = (displayed[0]?.record as OccurrenceRecord).raw_text;
      const boundaries = graphemeBoundaries(rawText);
      return (["description", "heading", "title"] as const).flatMap((field) =>
        !record[field].includes("\n") && containsGraphemeSpan(rawText, boundaries, record[field])
          ? []
          : [finding(entry, `/${field}`, `${field} is not an exact display-occurrence span`)]
      );
    });
  },
  id: "hadith.extracted_spans",
  prerequisites: [],
};

export const GRAPH_RULES = Object.freeze([
  identifierSourceUnique,
  identifierWitnessUnique,
  identifierSectionUnique,
  identifierOccurrenceUnique,
  identifierHadithUnique,
  witnessSourcePrefix,
  sectionOrdinalSequence,
  occurrenceOrdinalSequence,
  referenceSourceResolves,
  referenceWitnessResolves,
  referenceSectionResolves,
  referenceHadithResolves,
  referenceDisplayOccurrenceResolves,
  sectionParentAcyclic,
  sectionDepthFirstOrder,
  hadithNonempty,
  hadithDisplayIsMember,
  hadithExtractedSpans,
]);
