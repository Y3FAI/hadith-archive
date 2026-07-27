# Data Model

This document defines the entities of Open Hadith, the relationships between them, and the schema they produce. It builds on the vocabulary in [terms.md](terms.md), the commitments in [principles.md](principles.md), and the layers in [layers.md](layers.md).

Open Hadith preserves text from print editions and publishes it as public HTML. The model serves both. Preservation decides what may be stored; publication decides what must be addressable by a stable identifier. Where the two pull against each other, the model says which one gives way.

## Entities

### Source

A work, taken apart from any particular copy: *Forty Nawawi*, *Sahih al-Bukhari*, *Sahih Muslim*.

A source carries a priority score expressing the authority of the work itself. The score influences which text a hadith displays; the algorithm that consumes it is a governance decision and is not fixed here.

The definition is deliberately general. A hadith-grading work is also a source, its printed edition a source witness, and its verdicts occurrences within it. No separate machinery is required when such works are added.

### Source Witness

A single published print edition of a source, identified by the details that let another person obtain the same copy: title as printed, publisher, edition or printing, year, and ISBN.

A witness declares its own reference scheme — which location parts that edition provides, such as volume, page, or hadith number. Editions disagree about how to point at a text, and without a declared scheme an absent volume cannot be distinguished from a forgotten one.

A witness also carries a priority score, expressing the quality of that edition. It is distinct from the score on the source: the authority of a work and the care of a printing are different judgements, and both bear on which text is published.

### Section

A division of a source, as its author divided it: *kitab*, *bab*, *juz'*, part, or whatever divisions the work itself uses.

Sections nest to any depth and record what kind of division they are. They are not a fixed two-level hierarchy, because works are not organised alike, and a source may have none at all.

A section belongs to the source, not to any witness. The structure is the author's; a publisher's decision to bind a work in four volumes rather than six is an edition's property and is recorded in that witness's reference scheme instead.

### Occurrence

A single appearance of a text at a specific location within a source witness. It is the unit of preservation.

An occurrence holds its raw text — canonical UTF-8, opaque, isnad and matn together exactly as printed — its location within the witness, the fingerprint of its text, and an identifier derived from its provenance. It may also record the section of the work it falls within.

A location spans pages where the printed text does. A narration crossing a page break records where it begins and where it ends; a narration confined to one page records the same page for both.

An occurrence also records its ordinal: its position in the printed sequence of its witness. Editions that number their texts supply an order already, but many do not, and page alone cannot order two texts printed on the same page. The sequence is a fact about the book, recoverable only while the book is open, and it is what allows a section to be presented in the order its author arranged it.

An occurrence belonging to no hadith is a valid and expected state. Ingestion produces occurrences and nothing else; grouping them is separate, later work.

### Hadith

The canonical unit. A hadith gathers the occurrences of one narration wherever it appears — across editions and, more importantly, across works — selects one of them to supply its published text, and owns the public address at which it is served.

It is the only entity Open Hadith authors. A source, a witness, and an occurrence are all discoveries: a work exists, a book exists, ink on a page exists. A hadith is a judgement that several appearances are one narration.

That judgement is made deliberately. Scripts and assisted review propose candidates — whether a narration is already recorded, whether a new occurrence belongs with existing ones — and a person decides. Hadith are not regenerated. An existing hadith is altered only to correct a clear mistake.

The published text is selected, never composed. Where occurrences differ, the one that best represents their weighted agreement is published verbatim, in full, as one witness printed it. Open Hadith does not assemble a text that no edition contains.

A hadith also carries the text its page needs to be found: a title, a heading, and a description. These are chosen when the hadith is minted, by the same combination of scripts, assisted review, and human decision. They are drawn from the displayed occurrence and never written, which keeps a published page free of any sentence the project composed. Every occurrence a hadith gathers is presented on that page beneath the selected text, with its edition and location, so that a reader sees each appearance in full rather than a single version standing for all of them.

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
  SECTION ||--o{ SECTION : "parent_section_id"
  SOURCE_WITNESS ||--o{ OCCURRENCE : "witness_id"
  SECTION ||--o{ OCCURRENCE : "section_id"
  HADITH ||--o{ OCCURRENCE : "hadith_id"
  HADITH ||--|| OCCURRENCE : "display_occurrence_id"

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
    string edition
    int    year
    string isbn
    array  reference_scheme
    int    priority_score
  }

  SECTION {
    string section_id PK
    string source_id FK
    string parent_section_id FK "null at top level"
    string kind "kitab, bab, juz', part"
    string title
    int    ordinal
  }

  OCCURRENCE {
    string identifier PK "derived from witness and location"
    string witness_id FK
    string section_id FK "null if the work has no sections"
    string hadith_id FK "null until grouped"
    string volume "per reference_scheme"
    string page_start "per reference_scheme"
    string page_end "equals page_start when not spanning"
    string hadith_number "per reference_scheme"
    int    ordinal "position in the printed sequence"
    text   raw_text "canonical UTF-8, NFC"
    string fingerprint "sha256 of raw_text"
  }

  HADITH {
    string hadith_id PK
    string display_occurrence_id FK
    string title "span of the displayed raw_text"
    string heading "span of the displayed raw_text"
    string description "span of the displayed raw_text"
  }
```

`HADITH` and `OCCURRENCE` reference each other: an occurrence names the hadith it belongs to, and a hadith names the occurrence it displays. The cycle is intentional and is constrained below.

## Constraints

These are the rules verification enforces. Each fails on what a machine can prove.

**Provenance is mandatory.** `witness_id` on an occurrence and `source_id` on a witness are never absent, and must resolve to a registered record.

**Identity derives from provenance.** The pair of witness and location is unique across occurrences. Two texts at the same location in the same edition are the same occurrence. The identifier encodes that pair deterministically, so it can be recomputed from a citation and stays fixed when text is corrected.

**Location matches the declared scheme.** An occurrence supplies exactly the location parts its witness declares — no more, no fewer.

**Location is granular enough to be a key.** Where an edition prints two texts on one page, page alone cannot distinguish them; the scheme must provide something that does.

**Fingerprints match.** An occurrence's fingerprint is the SHA-256 of the canonical bytes of its raw text, recomputed on every change.

**A section stays within its source.** A section's parent belongs to the same source as the section itself.

**The displayed occurrence is a grouped occurrence.** A hadith's `display_occurrence_id` must name an occurrence whose `hadith_id` is that hadith. A hadith cannot publish text it does not gather.

**A hadith is never empty.** Every hadith groups at least one occurrence. An occurrence, by contrast, may belong to none.

**Published text is drawn, not written.** A hadith's title, heading, and description each appear verbatim within the raw text of the occurrence it displays. No page presents a sentence that no edition printed, and the rule is checkable rather than merely stated.

**Sequence is unique within a witness.** No two occurrences of the same witness share an ordinal, so the printed order is always total.

**A location does not end before it begins.** An occurrence's ending page is never earlier than its starting page.

## Addressing

A hadith is served at `/h/<id>`, independent of any collection. A narration that appears in Bukhari, Muslim, and Forty Nawawi belongs to none of them exclusively, and an address implying otherwise would assert a claim the project does not make.

Books and sections are addressable in their own right, at `/b/<source>/` and `/b/<source>/<section>`. These pages aggregate; they present no text that is not already preserved.

A section is presented as one witness printed it, in that witness's order, so that the page reflects a book a reader can hold rather than a composite of several. Where a source has more than one witness, the one with the highest priority score presents it, and equal scores are settled on the witness identifier so that a build is never left to chance. The same score therefore governs both which occurrence a hadith displays and which witness presents a section; raising it to correct one will also change the other.

Identifiers behind published addresses are permanent. They are not reused, and they are not recomputed. Where a hadith must be split, the original identifier is retained with its narrowed meaning and a new one is minted; where two must be joined, the older identifier survives and the newer redirects to it. Both operations are avoided by deciding carefully before minting rather than by correcting afterwards.

The form of the identifier itself is not yet fixed. No address may be published until it is, because an address that has been indexed cannot afterwards change.

## What the model excludes

**Translations.** Permanently. The corpus and the site are Arabic. English appears only where machines require it, in identifiers and addresses.

**Any internal structure of the text.** Raw text is one field. Isnad and matn are not separated, and narrators are not modelled, because both are editorial judgements made at ingestion and the model makes as few of those as possible.

**Normalized text.** Comparing occurrences requires setting aside tashkil, tatweel, and punctuation, but that form exists only while a comparison runs. It is never stored, because the data policy admits exactly one representation of a text.

**Grading.** Not yet carried, and it will need no new entity when it is: a grading work is a source like any other.

**Relationships between records.** Grouping by hadith expresses sameness, which was the whole of their early purpose. A relationship entity returns when assertions that are not sameness arrive.
