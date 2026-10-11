# Schema Architecture

This document defines how Open Hadith stores, types, validates, versions, and exposes its data. The entity model remains in [model.md](model.md); this document makes that model concrete as files and machine-readable schemas. The high-level software flow from canonical bytes through typed loading and repository verification is defined in [tooling.md](tooling.md).

The schema architecture serves four actors: ingestion pipelines that produce records, applications that consume data, humans who inspect and review it, and AI agents that navigate and verify it. Their needs differ, so the authoritative core and its derived representations have different jobs.

## Status

The storage architecture, type system, canonical JSON representation, schema-version policy, identifier forms, common semantic types, and exact version-one fields for all five entities are settled. The six version-one JSON Schemas implement that structural contract.

No core record is accepted until all five version-one entity schemas exist and the verifier enforces their structural and semantic rules.

## Authority and consumption

Authoritative core records are optimized for preservation, review, and independent inspection. Verification and build tooling may read them directly. Applications and bulk consumers use deterministic derived representations rather than treating the repository's directories as a permanent API.

```text
Published print editions
          │
          ▼
      Ingestion ──────────────► SOURCE_WITNESS · OCCURRENCE
                                      │
Human minting ───────────────────────► HADITH
                                      │
                                      ▼
                              Authoritative core
                                      │
                   ┌──────────────────┼──────────────────┐
                   ▼                  ▼                  ▼
               catalogs           exports          static HTML
                   │                  │                  │
                   └──────────────────┴──────────────────┘
                                      │
                                      ▼
                               applications
```

Ingestion and hadith minting remain separate. Ingestion produces source-bound occurrences; it does not group them or mint public identities. Derived catalogs, indexes, query databases, language bindings, exports, and HTML are reproducible and disposable. None becomes a source of truth.

Identifiers, record fields, schemas, and relationships form the durable data contract. Filesystem paths remain predictable and verifiable, but may later be reorganized or sharded without changing entity identity.

## Record granularity

Every authoritative `SOURCE`, `SOURCE_WITNESS`, `SECTION`, `OCCURRENCE`, and `HADITH` record is one standalone JSON file.

Record-level files provide small Git diffs, isolate concurrent edits, preserve attributable history, and allow independent validation. JSONL and JSON arrays are not authoritative storage because they place unrelated records in one mutable container. They may be generated as derived exports.

## Core topology

Authoritative records live under `core/`. Schemas live separately under `schemas/`.

```text
core/
  sources/
    <source_id>/
      source.json

      sections/
        <section_id>.json

      witnesses/
        <witness_id>/
          witness.json

          occurrences/
            <occurrence_id>.json

  hadith/
    <hadith_id>.json

schemas/
  common/
    v1.schema.json
  hadith/
    v1.schema.json
  occurrence/
    v1.schema.json
  section/
    v1.schema.json
  source/
    v1.schema.json
  source_witness/
    v1.schema.json
```

The tree mirrors provenance for human and AI navigation. A source directory contains the work's sections and print witnesses. A witness directory contains the occurrences transcribed from that printing. Sections remain flat beneath their source because `parent_section_id` expresses arbitrary-depth hierarchy. Hadith remain global because they span sources and belong beneath none of them.

Paths mirror relationships but do not define them. Every record carries its own identifier and foreign references. Verification checks that a record's physical placement agrees with its declared relationships.

The private `sources/` directory is separate from `core/sources/`. The former holds excluded working copies of print editions; the latter holds public source records and never contains a PDF, scan, or page image.

## Repository topology

The repository is a private Bun workspace monorepo. Authoritative data and schemas remain visible at the root; code is separated by producer, control, and consumer responsibility.

```text
apps/
  site/                       # future static public application

packages/
  canonical-json/             # deterministic JSON parsing and representation
    src/
    test/
  core-loader/                # read-only typed core access
    scripts/                  # deterministic binding generation and freshness check
    src/
      generated/
        records.ts            # committed schema-derived TypeScript bindings
      loader.ts
      schema-registry.ts
    test/
  verifier/                   # validation and historical checks
    src/
      cli.ts
      protocol.ts
      report.ts
      repository.ts
      rules/
    test/
      fixtures/
        valid/
        invalid/
          <rule_id>/
      integration/
      unit/
  ingestion/                  # future ingestion producer
  minting/                    # future HADITH producer

core/                         # authoritative public records
schemas/                      # authoritative JSON Schemas
docs/                         # public documentation

artifacts/                    # ignored reproducible output
  catalogs/
  exports/
  indexes/
  site/
  types/

workspace/                    # ignored private candidate work
  ingestion/
  minting/

sources/                      # ignored private print editions
decisions/                    # ignored private deliberation
AGENTS.md                     # ignored private contributor briefing

package.json                  # private Bun workspace root
bun.lock                      # committed text lockfile
tsconfig.json                 # shared strict compiler configuration
```

Only directories containing immediate implementation are created. Future packages and applications remain documented topology rather than empty placeholders.

`canonical-json` owns deterministic parsing, duplicate-key detection, formatting, and byte comparison. `core-loader` owns the offline structural schema registry and exposes read-only typed access to canonical, structurally valid records. `verifier` consumes those boundaries, reads the repository and Git history, and never writes. Its invalid fixtures live beneath its test tree rather than authoritative core paths.

Ingestion and minting are separate packages. They write provisional records only beneath their respective private workspace directories; promotion into `core/` is an explicit human-reviewed change. The site consumes the supported loader or reproducible artifacts and never imports private workspaces or writes authoritative data.

`artifacts/` contains disposable catalogs, exports, indexes, additional generated bindings, and static output. Nothing beneath it is authoritative or committed. The TypeScript bindings required to compile the supported loader are committed within that package and checked against the schemas; they remain derived rather than authoritative. `sources/`, `workspace/`, `decisions/`, `AGENTS.md`, and local agent settings remain entirely excluded from Git. Public source and witness records live only beneath `core/`; no Markdown or JSON exception exists beneath private `sources/`.

The root package and every workspace package declare `private: true` to prevent accidental registry publication. Root commands orchestrate verification, type-checking, and tests across workspaces.

## Authoritative type system

Strict JSON Schema Draft 2020-12 documents are the sole authoritative type definitions. JSON Schema was chosen because it is a standard, language-neutral JSON format that supports structural validation, reusable definitions, references, precise constraints, and independent meta-schema validation.

Each entity schema:

- declares the JSON Schema Draft 2020-12 dialect;
- has a stable schema identifier;
- defines exactly one record type and version;
- requires every mandatory property;
- constrains values as narrowly as the model permits;
- rejects unknown properties;
- references common semantic types instead of redefining them;
- contains descriptions sufficient for human and AI interpretation.

Common types live in `schemas/common/` and are reused through `$defs` and `$ref`. They include identifier types, fingerprints, schema versions, record types, canonical text, page references, ISBNs, and other definitions shared by several entities.

A project-specific type language is not used. It would create another specification, validator, and generator that the project would have to maintain indefinitely. JSON Type Definition is not used because its experimental and deliberately limited type system is weaker than the validation required by the core.

## Schema identifier namespace

Every schema has an absolute HTTPS `$id` that maps exactly to its path in the existing public repository. The namespace begins:

```text
https://raw.githubusercontent.com/Y3FAI/open-hadith/main/schemas/
```

For example, the version-one source schema declares:

```json
{
  "$id": "https://raw.githubusercontent.com/Y3FAI/open-hadith/main/schemas/source/v1.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema"
}
```

The same mapping gives identifiers such as:

```text
https://raw.githubusercontent.com/Y3FAI/open-hadith/main/schemas/common/v1.schema.json
https://raw.githubusercontent.com/Y3FAI/open-hadith/main/schemas/source_witness/v1.schema.json
https://raw.githubusercontent.com/Y3FAI/open-hadith/main/schemas/occurrence/v1.schema.json
```

References always select an exact version. A local relative reference such as `../common/v1.schema.json#/$defs/source_id` resolves to the same versioned HTTPS namespace; no schema references `latest` or an unversioned target.

The verifier registers the local schema files under their declared identifiers and rejects unexpected remote retrieval. Ordinary validation therefore requires no network access. It also checks that every `$id` agrees with the schema's repository path.

Once a schema is referenced by core data on `main`, its identifier, bytes, and meaning remain immutable. Moving or renaming the repository does not rewrite published identifiers; the original URLs remain available through a redirect or maintained mirror. A future project domain does not silently replace the namespace. Any namespace change is an explicit reviewed decision and begins with new schema versions.

## Common semantic types

`schemas/common/v1.schema.json` is the authoritative version-one common-type catalog. Its `$defs` keys are ASCII `snake_case`; prose and generated language bindings may expose conventional names such as `SourceId` and `RawText`.

| `$defs` key | Structural representation and meaning |
|---|---|
| `record_type` | String enum: `source`, `source_witness`, `section`, `occurrence`, `hadith` |
| `schema_version` | Semantic alias of `positive_integer`; each version-one entity schema further requires the constant `1` |
| `source_id` | Approved segmented ASCII slug with maximum length 64 |
| `witness_id` | Approved segmented ASCII slug with maximum length 128 |
| `section_id` | Approved segmented ASCII slug with maximum length 96 |
| `occurrence_id` | Positive integer |
| `hadith_id` | Positive integer |
| `positive_integer` | Integer from `1` through `9007199254740991`, inclusive |
| `ordinal` | Semantic alias of `positive_integer` |
| `page_number` | Semantic alias of `positive_integer` |
| `volume_number` | Semantic alias of `positive_integer` |
| `printed_hadith_number` | Semantic alias of `positive_integer` |
| `priority_score` | Integer from `0` through `100` |
| `publication_year` | Gregorian integer from `1000` through `9999` |
| `single_line_text` | Nonempty string governed by the approved NFC and single-line whitespace rules |
| `raw_text` | Nonempty string governed by the approved preservation and raw-whitespace rules |
| `extracted_span_text` | `single_line_text` with the additional cross-record contiguous-span rule |
| `fingerprint` | String matching `^[0-9a-f]{64}$` |
| `isbn13` | String matching `^97[89][0-9]{10}$` with a semantic checksum rule |
| `section_kind` | String enum: `kitab`, `bab`, `fasl`, `juz`, `qism` |
| `reference_scheme` | Closed object with required boolean `hadith_number` and `volume` properties |
| `location` | Closed object with required `page_start` and `page_end` and optional `volume` and `hadith_number`, all using their named positive-integer types |

JSON Schema enforces structural constraints. Named semantic checks enforce NFC, Unicode whitespace, ISBN checksum, fingerprint recomputation, extracted-span membership, page order, and the witness-dependent presence of location fields.

Semantically distinct values retain separate definitions even when their JSON representation is identical. A page number, ordinal, volume number, and printed hadith number are all positive integers but are not interchangeable concepts for documentation, validation errors, or generated bindings.

Every core positive integer is bounded by `9007199254740991`, JavaScript's maximum safe integer. Every integer through that bound is represented exactly and distinctly by the ordinary number type. The bound keeps schema validation, generated TypeScript bindings, applications, and cross-language JSON consumers on one lossless numeric representation. The generic canonical JSON parser remains capable of preserving larger integer literals, but authoritative core schemas reject them.

Entity schemas reference these definitions through an exact common version, for example:

```json
{
  "$ref": "../common/v1.schema.json#/$defs/source_id"
}
```

Entity schemas never copy a common constraint. A `$defs` name is permanent after use; renaming or changing a definition creates a new common-schema version. Common and entity schemas version independently. A generic string, number, integer, or open object is not used where a named semantic type exists.

## Self-describing records

Every record declares its entity type and schema version.

```json
{
  "record_type": "source_witness",
  "schema_version": 1
}
```

The pair maps deterministically to one schema:

```text
(source_witness, 1) → schemas/source_witness/v1.schema.json
```

Schema selection is never guessed from a filename or directory. A record copied outside the repository therefore remains identifiable and validatable.

The allowed record types are:

```text
source
source_witness
section
occurrence
hadith
```

The record is one direct JSON object. Metadata and entity fields are not wrapped in separate `metadata` and `data` objects, because such a wrapper adds nesting without creating a useful authority boundary.

## Canonical JSON representation

Every core file has one canonical byte representation:

- exactly one top-level JSON object;
- UTF-8 without BOM;
- Unicode scalar values only, with no unpaired UTF-16 surrogate in any string or key;
- Unicode Normalization Form C;
- LF line endings;
- two spaces per indentation level;
- no tabs or trailing whitespace;
- exactly one final LF;
- ASCII `snake_case` object keys;
- keys sorted lexicographically at every nesting level;
- literal Unicode values rather than optional `\uXXXX` escaping;
- only JSON-required character escaping;
- no duplicate keys;
- no unknown properties;
- omitted optional properties rather than `null`;
- no `null` unless a schema assigns it a distinct meaning;
- ordinary decimal notation for integers, without fractions or exponents;
- no floating-point values unless a future schema explicitly requires them.

Arrays preserve their defined semantic order. Any array representing an unordered set declares a deterministic sorting rule.

A pinned formatter produces the canonical representation. Verification compares every file with the formatter's expected bytes and fails on any difference. Verification never rewrites a record silently; a separate explicit formatting command may repair presentation before review.

## Type generation

Programming-language types are generated from the JSON Schemas. They are derived artifacts, never independent definitions.

A generated binding may expose a discriminated union such as:

```text
OpenHadithRecord = Source | SourceWitness | Section | Occurrence | Hadith
```

The `record_type` property supplies the discriminator. The supported TypeScript bindings are generated by the pinned `json-schema-to-typescript` tool and committed at `packages/core-loader/src/generated/records.ts`. Committing them gives tools and applications complete type information immediately after a clean checkout without making package installation or a generation step an implicit prerequisite for reading the code.

The generation command produces deterministic source from the five entity schemas. A required freshness check regenerates the source in memory and compares it byte for byte with the committed file. Schema changes therefore fail verification until the binding is regenerated. Other language bindings may be generated from the same schemas later. Generated files are never edited by hand, and compile-time types never replace canonical-byte and runtime structural validation.

## Identifier types

### Source identifier

A `SOURCE` receives a manually assigned, globally unique, permanent descriptive ASCII slug. Examples include `nawawi-40` and `sahih-al-bukhari`.

The common `SourceId` type has these constraints:

```json
{
  "maxLength": 64,
  "minLength": 1,
  "pattern": "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
  "type": "string"
}
```

The identifier is used in `/b/<source_id>/` and in the core tree. It is assigned manually from an established recognizable name, contains no publication details, never changes under metadata correction, and is never reused. The source's Arabic `title` remains authoritative; the identifier is not an authoritative transliteration or an automatically derived title.

### Source witness identifier

A `SOURCE_WITNESS` receives a manually assigned, globally unique, permanent descriptive ASCII slug. It begins with its exact `source_id`, followed by recognizable publisher, publication-year, and edition or printing components. For example:

```text
nawawi-40-dar-al-salam-2007-4
```

The common `WitnessId` type has these constraints:

```json
{
  "maxLength": 128,
  "minLength": 1,
  "pattern": "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
  "type": "string"
}
```

The identifier remains globally understandable outside its nested directory. Bibliographic fields remain authoritative; identifier components are navigation aids and are not recomputed when metadata is corrected. The identifier is never changed or reused. Distinct printings with indistinguishable ordinary metadata receive a meaningful reviewed qualifier explained by the witness record.

### Section identifier

A `SECTION` receives a permanent descriptive ASCII slug that is unique within its `SOURCE`. Its complete identity is `(source_id, section_id)`. For example:

```json
{
  "section_id": "kitab-al-hajj",
  "source_id": "sahih-al-bukhari"
}
```

The common `SectionId` type has these constraints:

```json
{
  "maxLength": 96,
  "minLength": 1,
  "pattern": "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
  "type": "string"
}
```

Its canonical page is `/b/<source_id>/<section_id>/`. A section kind may be included in the slug when useful. Parent ancestry is stored in `parent_section_id` and never encoded in the identifier, so a parent correction cannot change identity or address. Title and parent corrections do not change the identifier, and identifiers are never reused. A colliding natural slug receives the next unused numeric qualifier without renumbering existing sections.

### Occurrence identifier

An `OCCURRENCE` receives a globally unique positive integer when it is admitted to the authoritative core. For example:

```json
{
  "occurrence_id": 1842
}
```

The common `OccurrenceId` type has these constraints:

```json
{
  "minimum": 1,
  "type": "integer"
}
```

Identifiers begin at `1` and increase globally across the project. The next identifier is one greater than the greatest identifier ever minted. An identifier is assigned only when a provisional pipeline record is accepted into the core; it is not assigned to discarded candidates. Identifiers are never reused, and gaps have no meaning.

The identifier is independent of source, source witness, printed location, ordinal position, raw text, and `HADITH` membership. Correcting any of those facts does not change it. It has no scholarly, chronological, citation, or public-address meaning; the witness and location fields remain the human-verifiable citation.

The record is stored at `occurrences/<occurrence_id>.json` using the ordinary unpadded decimal representation, such as `occurrences/1842.json`. Tools sort integer identifiers numerically when order matters; file order never carries meaning.

Allocation uses the history of the authoritative branch rather than a separate counter file. Verification enforces global uniqueness, monotonic minting, non-reuse, and agreement between the record identifier and filename. If concurrent changes mint the same identifier, the later change must rebase and mint the next available integer before it can merge.

### Hadith identifier

A `HADITH` receives a globally unique positive integer beginning at `1`. The common `HadithId` type is the `hadith_id` definition in the versioned common catalog.

The next identifier is one greater than the greatest identifier ever minted. Identifiers are never reused, and gaps carry no meaning. The identifier represents minting order only and never implies ownership by a source, printed numbering, chronology, or scholarly rank.

The record is stored at `core/hadith/<hadith_id>.json` using ordinary unpadded decimal notation and owns the canonical trailing-slash address `/h/<hadith_id>/`. Split, merge, withdrawal, redirect, and tombstone behavior follows the permanent-address rules in the entity model.

## Witness reference schemes and occurrence locations

Every source witness declares whether its printed references use volumes and printed hadith numbers. Pages are universal and therefore are not an optional switch.

```json
{
  "reference_scheme": {
    "hadith_number": true,
    "volume": false
  }
}
```

Both properties are required booleans. Explicit `false` values distinguish a reference part that the printing does not use from information accidentally omitted during ingestion.

Every occurrence has a `location` object. For example:

```json
{
  "location": {
    "hadith_number": 13,
    "page_end": 43,
    "page_start": 42
  }
}
```

`page_start` and `page_end` are required positive integers. A text on one page records the same integer in both fields. `page_end` must not be less than `page_start`.

`volume` and `hadith_number` are positive integers when present. The verifier requires each field when its source witness declares the corresponding reference part and forbids it when the witness declares that part absent. Missing values are never represented by `null`, an empty string, zero, or a guessed number.

Printed Western and Arabic-Indic digit shapes have the same numeric meaning in location metadata: a page printed as `٤٢` is stored as `42`. Exact character preservation applies to `raw_text`, not to the typographic shape of navigation numbers.

An occurrence's positive integer `ordinal` remains separate from its location. It records the occurrence's unique position in the printed sequence and orders occurrences that share a page.

Version one accepts numeric printed references only. If a real witness uses nonnumeric, restarted, or ambiguous labels that this representation cannot identify precisely, ingestion stops for a reviewed schema extension rather than placing an arbitrary string or invented value in the core.

## Raw-text whitespace

`raw_text` is a nonempty NFC string. It preserves every report-body character printed by the source witness, including letters, diacritics, punctuation, tatweel, brackets, variants, and irregularities. Whitespace follows one deterministic transcription convention so page layout and extraction artifacts do not become false textual content.

- A visible separation between words is one ASCII space (`U+0020`).
- A printed line wrap or page break within continuing text becomes one ASCII space.
- A genuine paragraph or separately printed report-body block is separated by one LF (`U+000A`).
- Leading whitespace, trailing whitespace, repeated spaces, consecutive LF characters, tabs, carriage returns, and non-breaking spaces are forbidden.
- The invisible format characters listed in [data-policy.md](data-policy.md#invisible-format-characters) — every `Bidi_Control` character, U+200B, U+2060, and U+FEFF — are forbidden in raw text and in every single-line value. U+200C ZWNJ and U+200D ZWJ are not part of that list.
- The presence or absence of separation around punctuation follows the printing, but physical spacing width is not represented.

Running headers, page numbers, decorative numbering, section headings, editorial footnotes, and other matter outside the report body never enter `raw_text`.

The fingerprint is computed over the canonical UTF-8 bytes of the resulting string, including its ASCII spaces and meaningful LF characters. The pipeline may propose the representation, but it never silently rewrites approved text. An ambiguous boundary stops for human review.

## Priority scores

Every source and source witness carries an explicit `priority_score` with this structural type:

```json
{
  "maximum": 100,
  "minimum": 0,
  "type": "integer"
}
```

`0` is the ordinary baseline and expresses no special preference. A higher value has greater relative priority; equal values express equal priority. Only ordering has meaning. A score is not a percentage, confidence level, scholarly grade, quality measurement, or ratio, so a score of `80` is not twice a score of `40`.

The field is required and has no implicit default. New records begin explicitly at `0` unless a reviewed decision assigns another value. Pipelines never calculate or change scores automatically. A score change is a governance change with potentially broad presentation effects, not a transcription correction.

Source scores compare sources, and source-witness scores compare source witnesses; values across those entity types are never compared directly. The algorithm that eventually combines their influence on display-occurrence selection remains deferred until real multi-witness data exists. For section presentation, the already-settled rule selects the source witness with the highest score and breaks a tie lexicographically by witness identifier.

Negative values are forbidden. Any future need to exclude a record is represented explicitly rather than hidden in a score.

## Version-one entity records

### Source record

A version-one source record has exactly six required properties:

```json
{
  "author": "يحيى بن شرف النووي",
  "priority_score": 0,
  "record_type": "source",
  "schema_version": 1,
  "source_id": "nawawi-40",
  "title": "الأربعون النووية"
}
```

`record_type` is the constant `source`, `schema_version` is the integer constant `1`, `source_id` is the approved `SourceId`, and `priority_score` uses the approved `0` through `100` ordering type.

`title` is the manually reviewed canonical Arabic title of the abstract work. `author` is the manually reviewed canonical Arabic name of its author or compiler. Both use the common `SingleLineText` type: a nonempty NFC string with ordinary word separation represented by one ASCII space and no leading or trailing whitespace, repeated spaces, tabs, line breaks, or control characters. The type has no arbitrary maximum length that could reject a legitimate classical name.

The record lives at `core/sources/<source_id>/source.json`, and verification requires the directory component to equal the declared identifier. Correcting the title or author never changes the identifier.

Printing-specific facts belong to source-witness records. Version one adds no English title, transliteration, alias, description, tag, timestamp, or invented metadata. A genuinely anonymous or multiply authored work stops schema design for explicit review rather than using an empty string, `null`, `unknown`, or an improvised combined value.

### Source-witness record

A version-one source-witness record has exactly eleven required properties. This record is illustrative and makes no claim about a real publication:

```json
{
  "edition_statement": "الطبعة الرابعة",
  "isbn": "9780000000002",
  "priority_score": 0,
  "publication_year": 2007,
  "publisher": "مثال دار النشر",
  "record_type": "source_witness",
  "reference_scheme": {
    "hadith_number": true,
    "volume": false
  },
  "schema_version": 1,
  "source_id": "example-work",
  "title_as_printed": "مثال عنوان الكتاب",
  "witness_id": "example-work-example-publisher-2007-4"
}
```

`record_type` is the constant `source_witness`, `schema_version` is the integer constant `1`, `witness_id` is the approved `WitnessId`, `source_id` is the approved `SourceId`, `priority_score` uses the approved ordering type, and `reference_scheme` uses the approved explicit boolean object.

`title_as_printed`, `publisher`, and `edition_statement` use `SingleLineText`. They preserve the Arabic bibliographic statements of the printing. The edition statement remains complete, such as `الطبعة الرابعة`, rather than being reduced to the number `4`.

`publication_year` is the four-digit Gregorian year stated by the source witness. `isbn` is a normalized ISBN-13 containing exactly thirteen ASCII digits without spaces or hyphens. Structural validation checks its shape, and semantic verification checks its ISBN-13 checksum. Printed Arabic-Indic digits are represented by the same numeric values in ASCII; this bibliographic normalization does not apply to `raw_text`.

The record lives at `core/sources/<source_id>/witnesses/<witness_id>/witness.json`. Verification requires both directory components to agree with the record, requires `witness_id` to begin with the exact `source_id` followed by a hyphen, and resolves the source reference. Bibliographic corrections do not automatically rename the permanent witness identifier.

Every property is required. Empty strings, `null`, and unknown properties are forbidden. A public record contains no source PDF path, scan filename, download URL, acquisition note, or private working information.

A real printing without an ISBN-13 or explicit edition statement, with only a Hijri year, with multiple ISBNs, or with otherwise indistinguishable publication metadata stops ingestion for explicit schema review. Version one does not conceal such a case with an empty value, guess, or overloaded field.

### Section record

A version-one section record has seven required properties and an optional parent reference. A top-level section is represented as:

```json
{
  "kind": "kitab",
  "ordinal": 1,
  "record_type": "section",
  "schema_version": 1,
  "section_id": "kitab-bad-al-wahy",
  "source_id": "sahih-al-bukhari",
  "title": "كتاب بدء الوحي"
}
```

A nested section additionally carries `parent_section_id`:

```json
{
  "kind": "bab",
  "ordinal": 2,
  "parent_section_id": "kitab-bad-al-wahy",
  "record_type": "section",
  "schema_version": 1,
  "section_id": "bab-kayfa-kana-bad-al-wahy",
  "source_id": "sahih-al-bukhari",
  "title": "باب كيف كان بدء الوحي"
}
```

`record_type` is the constant `section`, `schema_version` is the integer constant `1`, `source_id` and `section_id` use their approved identifier types, and `title` uses `SingleLineText`. The title preserves the complete Arabic heading, including a printed division word such as `كتاب` or `باب`.

`kind` is a controlled machine-readable classification. Version one permits exactly `kitab`, `bab`, `fasl`, `juz`, and `qism`. A different division kind requires explicit schema review rather than an arbitrary string.

`ordinal` is a positive integer unique across the entire source. Source ordinals form a contiguous sequence beginning at `1` and express depth-first printed order: a parent precedes its descendants, and a complete subtree precedes the next sibling. Discovering a missing section may correct later ordinals but never changes section identifiers.

`parent_section_id` is present exactly when the section is nested and is omitted for a top-level section; `null` is forbidden. It resolves within the same source. Self-parenting, cycles, and a parent whose ordinal is not lower than its descendant are invalid.

The record lives at `core/sources/<source_id>/sections/<section_id>.json`, and verification checks both path identifiers. A source without sections has no section records. A record carries no section body, description, tags, child array, occurrence array, or witness-specific volume information.

### Occurrence record

A version-one occurrence record has eight required properties and two optional relationships. This illustrative record is ungrouped and has no applicable section:

```json
{
  "fingerprint": "8d7bfc3a90a1c0c2531a0bb7c409b4bfeddd0a07c4ce20ebcc79bf20cb401839",
  "location": {
    "hadith_number": 1,
    "page_end": 10,
    "page_start": 10
  },
  "occurrence_id": 1,
  "ordinal": 1,
  "raw_text": "مثال نص الحديث",
  "record_type": "occurrence",
  "schema_version": 1,
  "witness_id": "example-work-example-publisher-2007-4"
}
```

The example fingerprint is the SHA-256 of the example `raw_text`. The required fields are `fingerprint`, `location`, `occurrence_id`, `ordinal`, `raw_text`, `record_type`, `schema_version`, and `witness_id`. `record_type` is the constant `occurrence`, `schema_version` is the integer constant `1`, and the identifiers, location, and raw-text values use their approved types.

`fingerprint` is exactly 64 lowercase hexadecimal characters. Semantic verification recomputes it from the canonical UTF-8 bytes of `raw_text`, including meaningful spaces and LF characters.

`ordinal` is a positive integer unique within the source witness. Witness occurrence ordinals are contiguous from `1` in printed report order, independent of pages and printed hadith numbers. Authoritative ingestion therefore proceeds in printed order. Correcting an ordinal never changes the occurrence identifier.

`hadith_id` and `section_id` are optional properties. A present `hadith_id` is a positive `HadithId` assigned by human grouping. Its omission means that the occurrence is not grouped. A present `section_id` resolves within the witness's source. Its omission affirmatively means that no section applies; an occurrence cannot enter the core if an applicable source section has merely not been modeled. Neither state uses `null`, zero, an empty string, or a placeholder.

The record lives at `core/sources/<source_id>/witnesses/<witness_id>/occurrences/<occurrence_id>.json`. Verification checks all path components, resolves the witness and optional relationships, confirms the location against the witness reference scheme, and enforces the page range. `source_id` is deliberately not repeated in the record because it resolves through `witness_id`.

Normalized text, isnad or matn parts, narrator graphs, OCR confidence, transcription notes, timestamps, and source-file paths remain outside the occurrence record.

### Hadith record

A version-one hadith record has exactly seven required properties:

```json
{
  "description": "مثال نص الحديث",
  "display_occurrence_id": 1,
  "hadith_id": 1,
  "heading": "مثال نص الحديث",
  "record_type": "hadith",
  "schema_version": 1,
  "title": "نص الحديث"
}
```

`record_type` is the constant `hadith`, `schema_version` is the integer constant `1`, `hadith_id` is the approved `HadithId`, and `display_occurrence_id` is the approved `OccurrenceId` whose record supplies the complete published raw text.

`title`, `heading`, and `description` use the common `ExtractedSpanText` type. Each is nonempty NFC single-line text with no leading or trailing whitespace, repeated spaces, or control characters. Each must occur as one exact contiguous substring of the display occurrence's `raw_text`; it cannot concatenate passages, normalize characters, rewrite punctuation, summarize, paraphrase, or add an ellipsis. A span cannot cross a stored LF. The three values may overlap or be identical, and no arbitrary maximum length rejects a legitimate phrase.

The display occurrence must resolve and must carry the same `hadith_id`. At least one occurrence must name the hadith. Membership is discovered from occurrence records; the hadith record does not duplicate an `occurrence_ids` array. Changing the display occurrence revalidates all three spans, and scripts may propose but never approve a selection.

The record lives at `core/hadith/<hadith_id>.json` and owns `/h/<hadith_id>/`. Verification checks the filename, reciprocal membership, nonempty grouping, selected occurrence, and extracted spans.

The hadith record stores no second canonical text. Rendering resolves and publishes the display occurrence's complete `raw_text`. Translation, transliteration, grading, topic tags, narrator graphs, timestamps, and composed prose remain excluded.

## Verification layers

Schema validation is necessary but not sufficient. Verification proceeds in explicit layers.

### Protocol

Every authoritative rule has a stable lowercase identifier matching `^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$` and belongs to an explicit positive integer `verification_version`. Version one rules pass or fail only; warnings are not authoritative outcomes. Human-review suggestions may exist outside verification but never use authoritative rule identifiers.

A semantic change to a rule or its scope creates a new verification-catalog version. An implementation correction that restores the documented meaning does not. Every rule has passing and failing fixtures, and every verifier bug fix adds a regression fixture.

Each failure contains exactly four properties:

```json
{
  "file": "core/example.json",
  "instance_path": "/raw_text",
  "message": "raw_text is not NFC",
  "rule_id": "text.nfc"
}
```

`file` is repository-relative. `instance_path` is an RFC 6901 JSON Pointer, with the empty string representing the document root. `message` is produced by a stable English template and contains no timestamp, duration, machine path, environment detail, or stack trace.

The machine report is:

```json
{
  "findings": [],
  "valid": true,
  "verification_version": 1
}
```

Findings sort lexicographically by `file`, `instance_path`, `rule_id`, and `message`. Identical input produces byte-identical report bytes. Human terminal presentation is derived from this report and is not a separate authority.

Verification checks the complete repository by default and collects every failure it can safely evaluate. A rule runs only after its prerequisites succeed. A failed prerequisite makes the repository invalid; dependent rules are not mislabeled as passed. Missing schemas, unavailable required history, unknown record types, internal exceptions, or incomplete execution can never produce `valid: true`.

Validation performs no network request and makes no file change. Historical checks compare with an explicit Git base resolved to a commit before checking. Formatting, migration, and repair are separate explicit commands.

Repository verification reads the Git index: paths, file modes, and the exact staged blob bytes. Stage candidate additions, edits, and deletions with `git add` or `git rm` before verifying. Unstaged edits and untracked files are not part of that candidate. Symlinks and submodules at or beneath `core/` and `schemas/` fail `file.regular`; their targets are never read. Regular Git modes `100644` and `100755` are accepted. An unresolved index conflict prevents verification from completing (exit status `2`).

Exit status `0` means complete verification with every rule passing. Status `1` means complete verification found one or more content or schema failures. Status `2` means verification could not complete because of a tool, configuration, or environment failure.

### File representation

The verifier checks UTF-8, BOM absence, NFC, LF, canonical formatting, unique keys, and the final newline before trusting a parsed object.

### Structural validation

The verifier selects the schema from `record_type` and `schema_version`, validates the schema against its meta-schema, and validates the record against that entity schema.

### Record semantics

Named checks enforce properties that JSON Schema cannot prove alone, including fingerprint recomputation and rules involving the relationship between fields.

### Cross-record integrity

Named checks resolve foreign references, enforce global uniqueness, verify hadith membership and display selection, confirm section ancestry, and compare physical placement with declared provenance.

### Historical integrity

Named checks enforce non-reuse and permanence rules that require repository history, including the global `HADITH` sequence, redirects, tombstones, and identifiers that must survive correction.

### Derived reproducibility

Derived artifacts are built twice from the same core and compared byte for byte. Any difference is a defect.

Every verification rule has a stable name, an implementation, and tests. Verification passes or fails; it never warns authoritative data through and never silently changes core data.

## Version-one verification rules

The version-one catalog contains the following authoritative rules.

### Repository and file rules

| Rule identifier | Failure condition |
|---|---|
| `repository.private_material_absent` | Git tracks `AGENTS.md`, `decisions/`, `sources/`, a source PDF, scan, or other prohibited private material. Ignored local files are permitted. |
| `file.regular` | An index entry at or beneath `core/` or `schemas/` is not a regular Git file (mode `100644` or `100755`). Symlinks and submodules are rejected without reading their targets. |
| `file.valid_utf8` | A tracked schema or core JSON file is not valid UTF-8. |
| `file.no_bom` | A tracked schema or core JSON file begins with a BOM. |
| `file.lf_only` | A tracked schema or core JSON file contains CR or another line-ending form. |
| `file.final_lf` | A tracked schema or core JSON file does not end with exactly one LF. |
| `json.parseable` | A tracked schema or core JSON file is not valid JSON. |
| `json.unique_keys` | A JSON object contains a duplicate key, including equal duplicate values. |
| `json.canonical` | Formatting, key order, escaping, indentation, integer notation, or whitespace differs from canonical output, or a string or key contains an unpaired UTF-16 surrogate. |
| `text.nfc` | A string value in a core record is not NFC. |

### Schema and record rules

| Rule identifier | Failure condition |
|---|---|
| `schema.catalog_complete` | The versioned common schema or one of the five required entity schemas is absent. |
| `schema.meta_valid` | A schema does not validate against the official Draft 2020-12 meta-schema. |
| `schema.id_matches_path` | A schema `$id` does not exactly match its repository path. |
| `schema.references_exact` | A `$ref` is unresolved, remote, unversioned, or does not select the approved exact local version. |
| `record.schema_known` | A record's type and schema-version pair does not select a known schema. |
| `record.schema_valid` | Ajv rejects a record against its selected schema. |
| `record.path_matches` | A record path or filename disagrees with its entity or declared identifiers. |

### Common semantic rules

| Rule identifier | Failure condition |
|---|---|
| `text.single_line` | A single-line or extracted-span value violates the approved Unicode whitespace rules or contains a forbidden invisible format character. |
| `text.raw_whitespace` | Raw text contains forbidden leading, trailing, repeated, control, or layout whitespace, or a forbidden invisible format character. |
| `witness.isbn_checksum` | An ISBN-13 checksum is invalid. |
| `occurrence.fingerprint_matches` | The stored fingerprint differs from SHA-256 of the canonical raw-text bytes. |

### Identity and ordering rules

| Rule identifier | Failure condition |
|---|---|
| `identifier.source_unique` | Two source records declare the same source identifier. |
| `identifier.witness_unique` | Two source-witness records declare the same global witness identifier. |
| `identifier.section_unique` | Two sections within one source declare the same section identifier. |
| `identifier.occurrence_unique` | Two occurrences declare the same global occurrence identifier. |
| `identifier.hadith_unique` | Two hadith records declare the same global hadith identifier. |
| `witness.source_prefix` | A witness identifier does not begin with its exact source identifier followed by a hyphen. |
| `section.ordinal_sequence` | Source section ordinals do not form the duplicate-free sequence `1..N`. |
| `occurrence.ordinal_sequence` | Witness occurrence ordinals do not form the duplicate-free sequence `1..N`. |

### Reference and relationship rules

| Rule identifier | Failure condition |
|---|---|
| `reference.source_resolves` | A witness or section names a nonexistent source. |
| `reference.witness_resolves` | An occurrence names a nonexistent source witness. |
| `reference.section_resolves` | A parent or occurrence section reference does not resolve within the applicable source. |
| `reference.hadith_resolves` | A present occurrence hadith reference does not resolve. |
| `reference.display_occurrence_resolves` | A hadith display-occurrence reference does not resolve. |
| `occurrence.location_matches_scheme` | Volume or hadith number presence disagrees with the witness reference scheme. |
| `occurrence.page_order` | An ending page is less than its starting page. |
| `section.parent_acyclic` | A section parents itself or the parent graph contains a cycle. |
| `section.depth_first_order` | A parent does not precede its descendants or a subtree is not contiguous in source ordinal order. |
| `hadith.nonempty` | No occurrence names a hadith. |
| `hadith.display_is_member` | A displayed occurrence does not carry the displaying hadith's identifier. |
| `hadith.extracted_spans` | A title, heading, or description is not an exact contiguous single-line substring of displayed raw text. |

### Historical rules

| Rule identifier | Failure condition |
|---|---|
| `history.schema_immutable` | A schema version already used by merged core data is changed or removed. |
| `history.record_preserved` | A merged core record is deleted. Version one requires schema review before adding withdrawal or tombstone states. |
| `history.identifier_not_reused` | A current identifier was previously used by a different historical record. |
| `history.sequence_next` | Newly minted hadith or occurrence identifiers are not the uninterrupted range immediately after the greatest identifiers ever minted. |

The verifier cannot prove that raw text matches ink on a cited page, bibliographic metadata names the correct printing, a publisher meets the governance standard, an omitted section truly does not apply, grouped occurrences are the same narration, extracted spans are the best choices, or a priority score is scholarly appropriate. Those are human judgements and receive no machine rule identifiers. Verification proves repository consistency; independent verification compares the record with the physical source witness.

Derived-build reproducibility receives a rule when a real builder exists. Version one does not report an unimplemented artifact check as passed.

## Verifier implementation

The verifier and supporting data tooling are portable strict TypeScript executed by Bun. The initial pinned toolchain is:

```text
Bun 1.3.14
TypeScript 7.0.2
Ajv 8.20.0
json-schema-to-typescript 15.0.4
```

Bun is the official runtime, package manager, script runner, and test runner. The exact Bun version is declared in the repository and installed explicitly in continuous integration. Dependencies use exact versions without range prefixes, and the text-based `bun.lock` is committed. Continuous integration installs with `bun ci`, which fails when the manifest and lockfile disagree.

Bun executes TypeScript directly but does not type-check it. Type-checking with strict TypeScript and `tsc --noEmit`, verification, and tests are independent required commands.

Authoritative verification logic uses standard JavaScript and stable `node:` APIs rather than Bun-only APIs unless a reviewed need justifies otherwise. This keeps the core logic portable without maintaining a second supported runtime.

Ajv uses its Draft 2020-12 implementation with strict schema checking and all validation errors enabled. Type coercion, default insertion, property removal, and every other data-mutating option are disabled. All schemas are registered locally before compilation, and network loading is disabled. Authoritative schemas use standard JSON Schema keywords rather than validator-specific custom keywords.

Ajv enforces structural schemas only. File-byte checks, duplicate-key detection, UTF-8, NFC, fingerprints, relationships, historical integrity, and deterministic builds are named TypeScript checks outside Ajv. Error output is sorted deterministically by record path, instance path, and rule name.

Toolchain and dependency upgrades are deliberate reviewed changes that run the complete type-check, verification, and test suite.

## Schema versions

Each entity type has an independent positive integer schema version. Shared common types are versioned separately, and an entity schema references an exact common-schema version.

A schema may change while it is a draft and no record on `main` references it. Once a core record on `main` references that version, the schema's bytes and meaning are immutable. Any later structural, validation, semantic, or descriptive change creates the next integer version. Old schemas remain in the repository permanently.

The authoritative `main` branch contains only the current schema version for each entity type. A migration branch may temporarily contain mixed versions, but verification fails until the migration is complete. A schema migration changes all affected records, the verifier, and generated bindings together in one reviewed change.

Historical tags and releases retain their original records and corresponding schemas, so no historical record is interpreted using a later definition.

## Application and bulk access

Applications do not treat `core/` paths as a stable external API. They consume a supported loader or deterministic derived artifacts appropriate to their workload.

The supported loader accepts bytes or a file path. It first enforces canonical JSON, then selects a locally compiled schema only from the record's declared `record_type` and `schema_version`, and returns a generated discriminated record type only after structural validation succeeds. Successful records are recursively frozen before exposure. The loader performs no coercion, default insertion, property removal, network access, or write.

Expected failures are structured results rather than thrown validation exceptions. They distinguish file access, canonical representation, unknown record-schema pairs, and structural schema failures. Structural errors expose stable copied values rather than validator-owned mutable objects. Initialization failures such as a missing or invalid schema remain exceptions because the loader cannot operate safely without its complete trusted schema catalog.

Possible derived forms include compact catalogs for discovery, JSONL exports for streaming, search indexes, an ephemeral query database for static builds, and versioned language bindings. Their exact forms are chosen only when a real consumer requires them.

Humans and AI agents may use both views: catalogs for discovery and individual core files for provenance, content, and review. A catalog points to core records but never replaces them.

## Implementation status

The six version-one JSON Schemas, private Bun workspace root, core loader, and initial verifier package are implemented. The core loader's schema registry validates every schema against Draft 2020-12, checks each `$id` against its repository path, resolves exact local references without network access, compiles all five entity schemas, and tests valid and invalid records. The initial verifier consumes that shared structural boundary.

The canonical JSON package implements duplicate-aware parsing, lossless large integers, deterministic formatting, canonical byte comparison, and the approved UTF-8, BOM, line-ending, final-LF, NFC, and top-level-object boundaries. The core loader implements canonical, structurally validated file and byte loading; committed schema-derived TypeScript bindings with a deterministic freshness gate; structured failure results; deep runtime immutability; and structured inspection of the same schema catalog used for loading. The verifier implements its complete version-one protocol and rule catalog, including ancestry-indexed historical checks against an explicit base commit. The repository is ready to admit the first human-reviewed core record through the complete machine-verification boundary.

The first real source witness and occurrence are drafted only after these decisions produce complete version-one schemas. The draft then tests the schemas; it does not define them by accident.

## The rule

The core serves preservation first. Schemas define its structure exactly, canonical JSON defines its bytes exactly, and verification enforces every rule that structure alone cannot express. Applications adapt through deterministic derived representations; the authoritative core does not bend around the convenience of a particular consumer.
