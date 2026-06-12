# Terms

This document defines the core vocabulary of Open Hadith.

These terms are intentionally small and foundational. They exist to prevent ambiguity before data models, validation rules, tools, or applications are designed.

## Foundations

### Open Hadith

The project defined by this repository: an open, integrity-focused infrastructure for preserving Hadith text under a principled data architecture.

### Hadith

A transmitted report of what the Prophet Muhammad (peace be upon him) said, did, or approved.

## Sources

### Source

A work whose text Open Hadith preserves, such as the Hadith collection *Sahih al-Bukhari*, taken as an abstract work apart from any particular copy.

### Source Witness

A specific, citable instance of a source that text is actually preserved from: a named print edition, manuscript, scan, or digital file. A source name alone is not a source witness.

## Occurrences

### Occurrence

A single appearance of a Hadith text at a specific location within a source witness. It is the core unit Open Hadith preserves.

The same text appearing in another witness, or at another location in the same witness, is a separate occurrence.

### Location

The position of an occurrence within its source witness, expressed using whatever reference points the witness provides, such as book, chapter, page, or Hadith number.

### Raw Text

The preserved text of an occurrence: its source characters in canonical form, as the data policy defines, with nothing corrected, added, or removed.

## Records

### Record

The stored representation of a single occurrence: its raw text together with the information needed to identify, locate, and verify it.

### Identifier

The stable name that distinguishes one occurrence from every other.

An identifier stays fixed even if the raw text is later corrected. Identity comes from provenance, not from the text itself.

### Provenance

The documented trail that ties a record to its source witness and shows where its text came from. Provenance is what makes a record traceable.

### Fingerprint

A value computed from raw text that changes whenever the text changes, used to detect alteration.

A fingerprint verifies content; it does not identify the occurrence.

### Verification

The process of checking that a record is valid: that its raw text still matches its fingerprint, and that its required information is present and well-formed.

## Properties

### Integrity

The property that a record's content remains as it was preserved, and that any change to it can be detected.

### Uniqueness

The property that each occurrence has one distinct identity that no other record shares.

### Traceability

The property that every change to a record can be inspected and attributed.

### Non-repudiation

The property that actions taken on a record are attributable to whoever took them.

### Availability

The property that records can be obtained and used when needed.

### Durability

The property that records survive deletion, corruption, and the failure of any single system.

### Longevity

The property that records remain readable and understandable far beyond the tools that created them.
