# Data Model

This document defines the entities of Hadith Archive, the relationships between them, and the schema they produce. It builds on the vocabulary in [terms.md](terms.md), the commitments in [principles.md](principles.md), and the layers in [layers.md](layers.md).

Hadith Archive preserves text from print editions and publishes it as public HTML. The model serves both. Preservation decides what may be stored; publication decides what must be addressable by a stable identifier. Where the two pull against each other, the model says which one gives way.

## Entities

### Source

A work, taken apart from any particular copy: *Forty Nawawi*, *Sahih al-Bukhari*, *Sahih Muslim*.

A source carries a required integer priority score from `0` through `100` expressing the relative authority of the work itself. Zero is the ordinary baseline, and only ordering has meaning. The score informs the reviewed selection of a display occurrence; the selection is saved before building, not recalculated by the renderer. The review method that combines source and witness priorities is a governance decision and is not fixed here.

The definition is deliberately general. A hadith-grading work is also a source, its printed edition a source witness, and its verdicts occurrences within it. No separate machinery is required when such works are added.

### Source Witness

A specific published printing of a source, identified by the details that let another person obtain an interchangeable copy: title as printed, publisher, complete edition or printing statement, Gregorian publication year, and ISBN-13 or ISBN-10. Two physical copies of the same printing are one source witness; a distinguishable edition or printing is another. The edition statement, year, and ISBN are recorded when the printing states them and omitted, never improvised, when it does not.

A witness also records the SHA-256 of the file its records were taken from: the publisher's PDF, or the scan of the printed copy. For a PDF edition released without an ISBN, that hash is what identifies it. A witness that names no publisher records its editor as the publisher.

A witness declares its own reference scheme. A page span is universal; the scheme records whether that printing also uses volumes or printed hadith numbers. Editions disagree about how to point at a text, and without a declared scheme an absent volume cannot be distinguished from a forgotten one.

A witness also carries a required integer priority score from `0` through `100`, expressing the relative quality of that edition. Zero is the ordinary baseline, and only ordering has meaning. It is distinct from the score on the source: the authority of a work and the care of a printing are different judgements, and both bear on which text is published.

### Section

A division of a source, as its author divided it: *kitab*, *bab*, *juz'*, part, or whatever divisions the work itself uses.

Sections nest to any depth and record what kind of division they are. They are not a fixed two-level hierarchy, because works are not organised alike, and a source may have none at all.

Each section has a source-wide positive ordinal in depth-first printed order. The ordinals are unique and contiguous from `1`, so flat records reproduce the complete authored sequence without deriving order from identifiers or directory traversal. Version one recognizes the controlled kinds `kitab`, `bab`, `fasl`, `juz`, and `qism`.

A section belongs to the source, not to any witness. The structure is the author's; a publisher's decision to bind a work in four volumes rather than six is an edition's property and is recorded in that witness's reference scheme instead.

### Occurrence

A single appearance of a text at a specific location within a source witness. It is the unit of preservation.

An occurrence holds its raw text — canonical UTF-8, opaque, isnad and matn together exactly as printed — its location within the witness, the fingerprint of its text, and a stable internal identifier assigned to it. The identifier is separate from the citation that lets a person find the occurrence. It may also record the section of the work it falls within.

Raw text is the report body. It includes punctuation, diacritics, bracketed text, and variants presented as part of the report, but excludes running headers, page numbers, decorative numbering, section headings, and editorial footnotes.

A location spans pages where the printed text does. A narration crossing a page break records where it begins and where it ends; a narration confined to one page records the same page for both.

An occurrence also records its ordinal: its position in the printed sequence of its witness. Editions that number their texts supply an order already, but many do not, and page alone cannot order two texts printed on the same page. The sequence is a fact about the book, recoverable only while the book is open, and it is what allows a section to be presented in the order its author arranged it.

Occurrence ordinals are unique and contiguous from `1` within a source witness, so authoritative ingestion follows printed report order. An occurrence carries no reference to a hadith; grouping is recorded on hadith records, and an occurrence that no hadith lists is not yet grouped. Omitted section membership affirmatively means that no section applies, not that an applicable section remains unrecorded.

An occurrence belonging to no hadith is a valid and expected state. Ingestion produces occurrences and nothing else; grouping them is separate, later work.

### Collation

A comparison of one occurrence with the same report as another witness of the same source prints it. The occurrence holds the full text from one witness; a collation records only where the other witness prints the report and where its text differs. Anyone holding that printing can check every difference against the page.

A collation is identified by its witness and the occurrence it compares, and holds one entry per pair. It records the location of the report in its own witness, the span of the occurrence's raw text that the witness prints, and each difference within that span. A difference gives a range of the raw text, counted in Unicode code points from zero, that exact text, what the witness prints in its place (empty when it prints nothing), and whether the difference is in wording or only in spelling: vowels, letters, or punctuation. An insertion is an empty range. A collation without differences records an exact match.

A collation's status is derived, never stored: it matches exactly when it has no differences, differs in wording when any difference is in wording, and otherwise differs in spelling. Which kind a difference is remains a reviewed judgement; the verifier checks only that each difference quotes the raw text exactly and changes it.

### Hadith

The canonical unit. A hadith gathers the occurrences of one narration wherever it appears — across editions and, more importantly, across works — selects one of them to supply its published text, and owns the public address at which it is served.

It is the only entity in the preservation core that Hadith Archive authors; project topics are separate editorial records outside that core. A source, a witness, and an occurrence are all discoveries: a work exists, a book exists, ink on a page exists. A hadith is a judgement that several appearances are one narration.

That judgement is still authoritative core data. The core holds the source-bound records and, beside them, the human-reviewed hadith records that group them. A hadith record is not derived and cannot be regenerated from the others; it is kept, verified, and preserved under the same rules as the records it groups.

That judgement is made deliberately. Scripts and assisted review propose candidates — whether a narration is already recorded, whether a new occurrence belongs with existing ones — and a person decides. Hadith are not regenerated. An existing hadith is altered only to correct a clear mistake.

The published text is selected, never composed. A reviewed hadith record saves both the occurrence that supplies it and the exact selected quotation in one `text` field. Source and witness priorities may inform that review, but neither priority changes nor a new build silently replace the saved selection. Hadith Archive does not assemble a quotation that no edition contains.

The saved `text` supplies the page's heading and its title: the text from the Prophet's first marked words (else from its start), cut to whole words with «...» to fit a search result. The page's description is where the text is printed: the book, the hadith's number, the printing, and the volume and page. The record stores no separate versions for those uses. It is a nonempty contiguous span of the displayed occurrence's raw text and may cross stored LF boundaries. It begins and ends on extended grapheme-cluster boundaries, so neither end cuts a letter from its marks. It cannot join separate passages, normalize characters, paraphrase, add punctuation, or insert an ellipsis. Every member occurrence is presented in full beneath it with its edition and location. The selected quotation therefore never replaces the preserved full report.

Grouping, the display occurrence, and the quotation are editorial decisions made and reviewed before a build. Scripts or AI may propose candidates in private workspaces; a person approves the saved records. A build reads those decisions unchanged and never invokes AI to infer a grouping, choose an occurrence, or locate a passage. A missing or invalid required decision stops the build. Correcting the displayed raw text revalidates the saved quotation. A correction elsewhere can leave it valid; the check fails only if no exact contiguous match with valid grapheme boundaries remains. A person then reviews the saved decision rather than the build silently moving its boundaries.

Membership is recorded once, on the hadith, as the set of its occurrence identifiers. The set is written in strictly ascending numeric order so that one membership has one representation; the order carries no editorial or display meaning, and the displayed occurrence is chosen separately. Occurrence records carry no reference back, so a reviewed change to a grouping edits hadith records and never rewrites preserved text.

## Project topics outside the core

Categories («الأقسام») are the project's own topics, not divisions printed by a source author. A source section belongs to one work; a topic can gather hadith across works, and a hadith belongs to one topic at most. The owner reviews category membership.

Topic definitions and memberships are saved editorial inputs outside `core/`. They reference hadith identities and contain no copied hadith text or citations. They are authoritative for the project's classification decisions, rather than generated guesses or a second preservation corpus. A membership change is a new reviewed edit; rebuilding pages does not recreate or change it.

The generator combines those saved decisions with core records and fixed presentation rules. Generated pages, indexes and application exports are disposable projections; they may reproduce text resolved from the core, but no hand-edited application projection duplicates that content.

## Conceptual structure

Entities are rectangles, relationships diamonds. Each line carries the participation of the entity it touches, written as (minimum, maximum).

```mermaid
flowchart TB
  SRC["SOURCE"]
  WIT["SOURCE WITNESS"]
  SEC["SECTION"]
  OCC["OCCURRENCE"]
  HAD["HADITH"]

  pub{"published as"}
  div{"divided into"}
  nst{"contains"}
  hld{"contains"}
  sit{"situated in"}
  grp{"groups"}
  dsp{"displays"}

  SRC -- "(0,N)" --- pub
  pub -- "(1,1)" --- WIT

  SRC -- "(0,N)" --- div
  div -- "(1,1)" --- SEC

  SEC -- "(0,N)" --- nst
  nst -- "(0,1)" --- SEC

  WIT -- "(0,N)" --- hld
  hld -- "(1,1)" --- OCC

  SEC -- "(0,N)" --- sit
  sit -- "(0,1)" --- OCC

  HAD -- "(1,N)" --- grp
  grp -- "(0,1)" --- OCC

  HAD -- "(1,1)" --- dsp
  dsp -- "(0,1)" --- OCC
```

Four readings carry most of the meaning.

Every witness belongs to exactly one source, and every occurrence to exactly one witness. Provenance is mandatory at both steps, and nothing enters the record without it.

A section's parent is another section, or nothing. This is what allows a work to be divided as its author divided it, however deeply.

An occurrence may belong to no hadith. This is not an incomplete record; it is preservation that has run ahead of judgement, which is the intended order.

A hadith groups at least one occurrence and displays exactly one. The displayed occurrence is necessarily among those it groups.

## Relational schema

```mermaid
erDiagram
  SOURCE ||--o{ SOURCE_WITNESS : "source_id"
  SOURCE ||--o{ SECTION : "source_id"
  SECTION o|--o{ SECTION : "parent_section_id"
  SOURCE_WITNESS ||--o{ OCCURRENCE : "witness_id"
  SOURCE_WITNESS ||--o{ COLLATION : "witness_id"
  OCCURRENCE ||--o{ COLLATION : "occurrence_id"
  SECTION o|--o{ OCCURRENCE : "section_id"
  HADITH o|--|{ OCCURRENCE : "member_occurrence_ids"
  HADITH o|--|| OCCURRENCE : "display_occurrence_id"

  SOURCE {
    string source_id PK
    string title
    string author
    int    priority_score
  }

  SOURCE_WITNESS {
    string witness_id PK
    string source_id FK
    string title_as_printed
    string publisher
    string edition_statement "when printed"
    int    publication_year "when printed"
    string isbn "ISBN-13 or ISBN-10, when printed"
    string file_sha256 "sha256 of the PDF or scan"
    object reference_scheme
    int    priority_score
  }

  SECTION {
    string section_id PK
    string source_id FK
    string parent_section_id FK "omitted at top level"
    string kind "kitab, bab, fasl, juz, qism"
    string title
    int    ordinal
  }

  OCCURRENCE {
    int    occurrence_id PK "stable internal identifier"
    string witness_id FK
    string section_id FK "omitted when no section applies"
    int    volume "per reference_scheme"
    int    page_start
    int    page_end "equals page_start when not spanning"
    int    hadith_number "per reference_scheme"
    int    ordinal "position in the printed sequence"
    text   raw_text "canonical UTF-8, NFC"
    string fingerprint "sha256 of raw_text"
    json   prophet_words "optional code-point ranges of raw_text"
  }

  COLLATION {
    string witness_id PK "the collated witness"
    int    occurrence_id PK "an occurrence of another witness"
    object location "in the collated witness"
    int    span_start "code points into raw_text"
    int    span_end
    object[] differences "start, end, text, reading, kind"
  }

  HADITH {
    int    hadith_id PK "positive global sequence"
    int[]  member_occurrence_ids FK "nonempty set, ascending numeric order"
    int    display_occurrence_id FK "one of member_occurrence_ids"
    text   text "saved exact span of the displayed raw_text"
  }
```

References between `HADITH` and `OCCURRENCE` run one way. A hadith names every occurrence it groups and the one it displays; an occurrence names no hadith. Source-bound records therefore never depend on a grouping judgement, and changing that judgement touches only hadith records. The constraints below keep the one-way references consistent.

## Constraints

These constraints combine machine-checkable rules with human review. Verification enforces what a machine can prove; agreement with the printed witness and the reason for a correction remain human judgements.

**Provenance is mandatory.** `witness_id` on an occurrence and `source_id` on a witness are never absent, and must resolve to a registered record.

**Identity is stable.** Every occurrence has one unique internal identifier. The identifier is assigned once, never reused, and remains fixed when raw text or location metadata is corrected.

**Location matches the witness.** Every occurrence supplies its starting and ending page. It supplies a volume when the witness has volumes and a printed hadith number when the printing assigns one.

**Location and identity are separate.** Location exists to let a person find the occurrence in the witness; it is not the occurrence's identifier. An ordinal distinguishes and orders multiple occurrences printed on the same page.

**Fingerprints match.** An occurrence's fingerprint is the SHA-256 of the canonical bytes of its raw text, recomputed on every change.

**Corrections restore fidelity.** Raw text changes only when it does not match the cited source witness. Errors and irregularities printed by the witness are preserved.

**A section stays within its source.** A section's parent belongs to the same source as the section itself.

**Section structure is total.** Section ordinals are unique and contiguous within a source, parents precede descendants, and the parent graph has no self-reference or cycle.

**The displayed occurrence is a grouped occurrence.** A hadith's `display_occurrence_id` must appear in its own `member_occurrence_ids` and resolve to exactly one occurrence. A hadith cannot publish text it does not gather.

**A hadith is never empty.** Every hadith lists at least one occurrence, and every listed identifier resolves to exactly one occurrence. A hadith of one occurrence is valid.

**An occurrence belongs to at most one hadith.** No occurrence identifier appears in the member lists of two hadith, whether or not either displays it. An occurrence, by contrast, may belong to none.

**Membership has one representation.** A member list contains no repeated identifier and is written in strictly ascending numeric order.

**Published text is drawn, not written.** A hadith's saved `text` appears verbatim as one contiguous span within the raw text of its display occurrence, in at least one place where both ends fall on extended grapheme-cluster boundaries. Stored line breaks within that span are retained. A machine checks quotation fidelity; a person decides whether the chosen passage is appropriate.

**Sequence is complete within a witness.** Occurrence ordinals are unique and contiguous from `1`, so the printed order is always total and authoritative ingestion proceeds in that order.

**A location does not end before it begins.** An occurrence's or collation's ending page is never earlier than its starting page.

**A collation compares two printings of one work.** Its witness and occurrence resolve, the occurrence belongs to a different witness of the same source, and its location follows its own witness's reference scheme.

**A collation quotes exactly.** Its span is a nonempty range of the occurrence's raw text. Each difference lies within the span, starts and ends on extended grapheme-cluster boundaries, quotes the raw text in that range exactly, and changes it. Differences are in order without overlap, and two insertions at one point are one difference.

## Addressing

A hadith receives a positive global sequential integer, beginning at `1`, and is served at the canonical address `/h/<id>/`. The integer has no leading zeroes: hadith `13` is served at `/h/13/`. A narration that appears in Bukhari, Muslim, and Forty Nawawi belongs to none of them exclusively, and an address implying otherwise would assert a claim the project does not make.

The next identifier is one greater than the highest identifier ever minted. Identifiers are never reused, and gaps carry no meaning. The sequence expresses minting order only; it does not reproduce the numbering of any source.

Books and sections are addressable in their own right, at `/b/<source>/` and `/b/<source>/<section>/`. These pages aggregate; they present no text that is not already preserved.

A section is presented as one witness printed it, in that witness's order, so that the page reflects a book a reader can hold rather than a composite of several. Where a source has more than one witness, the one with the highest priority score presents it, and equal scores are settled on the witness identifier so that a build is never left to chance. The score informs reviewed display-occurrence selection and mechanically selects the witness for section presentation. Changing a score may change the section view, but never replaces a hadith's saved display occurrence without a reviewed edit.

Identifiers behind published addresses are permanent. They are not reused, renumbered, or recomputed. Where a hadith must be split, the original identifier is retained with the narration closest to its established meaning and every additional result receives a new identifier. Where two must be joined, the older identifier survives and the newer becomes a permanent redirect. Where a hadith must be withdrawn, its address remains as a tombstone explaining that the identifier was withdrawn. These operations are avoided by deciding carefully before minting rather than by correcting afterwards.

The trailing slash is part of the canonical address. A host may redirect the slashless form, such as `/h/13`, to `/h/13/` as a convenience, but the two forms are not separate identifiers.

## What the model excludes

**Translations.** Permanently. The corpus and the site are Arabic. English appears only where machines require it, in identifiers and addresses.

**Any internal structure of the text.** Raw text is one field. Isnad and matn are not separated, and narrators are not modelled, because both are editorial judgements made at ingestion and the model makes as few of those as possible.

**Normalized text.** Comparing occurrences requires setting aside tashkil, tatweel, and punctuation, but that form exists only while a comparison runs. It is never stored, because the data policy admits exactly one representation of a text.

**Grading.** Not yet carried, and it will need no new entity when it is: a grading work is a source like any other.

**Relationships between records.** Grouping by hadith expresses sameness, which was the whole of their early purpose, and it lives in the core as reviewed hadith records. A relationship entity for assertions that are not sameness remains deferred until such assertions arrive.
