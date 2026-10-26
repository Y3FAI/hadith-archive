# Layers

This document defines the layers of Open Hadith and how data moves through them. Each layer has one job and is built from the layer before it. Two cross-cutting controls — verification and governance — protect the whole flow. This makes the Separation of Concerns principle concrete; it builds on the vocabulary in [terms.md](terms.md) and the commitments in [principles.md](principles.md). The software boundaries that read and enforce core data are defined separately in [tooling.md](tooling.md).

```
Sources ───────┐
Ingestion ─────┤
Core ──────────┤── Verification · Governance
Relationships ─┤
Derived ───────┤
Application ───┘
```

Data flows top to bottom. Verification and governance apply across every layer.

## Sources

The published print editions outside the project that text comes from. Open Hadith does not own, control, or redistribute its sources; it records which witness each record came from, described precisely enough that anyone can obtain the same edition and turn to the same page.

## Ingestion

Ingestion turns a source into canonical core records. It reads the source text, converts it to the canonical form (UTF-8, NFC, LF), binds it to its source witness and location, assigns its identifier, and computes its fingerprint. Ingestion is the only layer that transforms text; once a record is in the core, downstream layers never transform it. Any correction to the core itself happens only through governance and traceable review.

## Core

The project's only authoritative data. The core holds the preserved, source-bound records, each bound to its provenance and identity and each preserved text to its fingerprint, together with the human-reviewed hadith records that group them. A hadith record is a reviewed judgement rather than a discovery, but it is authoritative, not derived: its membership references point from the hadith to the occurrences it groups, never back, so a grouping decision never rewrites a source-bound record. Everything else is built from the core, and nothing rewrites it.

## Relationships

Assertions between core records that are not identity or hadith membership, such as parallels and cross-references. The same narration appearing in different witnesses is grouped by a hadith record in the core, not by this layer. This layer remains deferred: relationship data is introduced only when the project carries assertions beyond sameness; it references core records by identifier and never alters, merges, or replaces them.

## Derived

Anything generated from the core for use: normalized text, search indexes, comparison forms, exports. Derived data is reproducible and disposable — it can be rebuilt from the core at any time, and it is never authoritative.

## Application

Interfaces that serve people: browsing, search, APIs, the web app. Applications read from the core, relationship, and derived layers and present them; they never write to the core.

## Verification

A cross-cutting control that checks every layer against its rules — that a witness is registered, that text matches its fingerprint, that identifiers are unique, that relationships point to real records, that derived outputs are reproducible. Verification owns checks, not data: it does not define truth, only tests whether the project's claims are internally valid — consistent with the rules and the fingerprints, not whether the text matches the world. Whether a record matches its printed page is independent verification, and it happens outside the project, performed by a person holding the edition. It never silently fixes anything. Each authoritative machine rule passes or fails; human judgement and review notes remain governance work rather than warnings that allow questionable core data to pass verification.

## Governance

A cross-cutting control that decides the rules themselves: what each layer may contain, how rules change, who reviews, and how review notes, disputes, and exceptions are resolved. Where verification asks whether the rules are obeyed, governance decides what they are.

## The rule

Data flows one direction: each layer is built from the one before it and never rewrites it. Only ingestion transforms text, and only on the way into the core. Verification judges every step but changes nothing. Within Open Hadith, the core is the authoritative project record — relationships, derived data, and applications depend on it and can be rebuilt, but the core depends on none of them.
