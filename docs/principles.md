# Principles

This document states the principles of Hadith Archive. Each one explains what the principle is and, in concrete terms, how we uphold it. They build on the vocabulary defined in [terms.md](terms.md).

## Openness

Everything Hadith Archive preserves is public and independently inspectable, which is what lets every other principle be verified rather than merely trusted. It lives in a public GitHub repository anyone can clone or download without an account, stored as plain-text files that need no special software, with its full history kept in Git and released under the [Hadith Archive Licence](../LICENSE).

## Provenance

Every preserved occurrence is bound to a specific source it can be traced back to, so nothing stands on unknown origin. Each occurrence names its source witness and location; witnesses are defined in their own records, and verification rejects a missing or unresolved witness reference. Source and section records describe the work itself, while hadith records trace their provenance through the occurrences they group. Because every witness is a print edition identified by publisher, edition, year, and ISBN, provenance is not merely recorded but actionable: anyone may obtain the same book and check the page for themselves.

## Fidelity

Preserved text faithfully represents its source witness, including its errors, unusual spellings, and irregularities; we keep what the source says, not what we think it should say. Text is stored in canonical form (UTF-8, NFC) as the data policy defines, with nothing corrected or removed. When stored text does not match its cited witness, it is corrected through review to restore that match. An apparent error printed by the witness remains untouched.

## Integrity

A record's content stays as it was preserved, and any change to it can be detected. Git already names every file and commit by a hash of its content, so altered content or rewritten history breaks the chain; on top of that, each occurrence carries a SHA-256 fingerprint of its raw text that automated checks recompute on every change, and the protected `main` branch admits changes only through reviewed pull requests, with no force-pushes.

## Uniqueness

Each occurrence has one distinct identity that no other record shares; the same or similar text appearing in different places is several occurrences, not one. Each occurrence receives a stable internal identifier separate from its text and source location, verification rejects any two occurrences sharing an identifier, and similar texts are grouped by a hadith rather than merged as occurrences.

## Traceability

Every change to a record can be inspected and attributed — what changed, when, and by whom — with nothing entering silently. Every change is a Git commit carrying its author and timestamp, made through a reviewed pull request, and the protected `main` branch blocks force-pushes and history rewrites so the record cannot be quietly erased.

## Non-repudiation

Every accepted change is attributable to a verified identity, so an action can be checked rather than merely claimed. Every commit is signed with an SSH key, and GitHub verifies each signature against the author's registered key before it can reach `main`, which requires verified signatures.

## Separation of Concerns

The core preserves source-bound truth and reviewed hadith decisions: grouping, the display occurrence, and its exact selected quotation. Project topics and their owner-reviewed memberships live in separate saved editorial records outside the core, referring to hadith without copying their text. These decisions are inputs, not disposable build output. Search, rendering, normalization, and linking may never redefine them. Fixed presentation rules live in code; derived files and pages — including normalized text, indexes, and search forms — can be rebuilt from the same saved inputs or discarded without touching them. Builds run without AI and never make editorial decisions.

## Availability

Records can be obtained and used whenever needed, without depending on a single interface, service, or custodian. The full corpus can be cloned or downloaded as plain data at any time, with no running application, database, or API in the way, and tagged releases will provide stable downloadable snapshots.

## Durability

Records survive deletion, corruption, and the failure of any single system; the corpus can be restored, not merely hosted. Because it is distributed by Git, every complete clone holds the entire history independently, the protected `main` branch cannot be force-pushed or deleted, and verified releases and external mirrors will provide checkable copies beyond GitHub.

## Longevity

Records remain readable and understandable far beyond the tools, people, and platforms that created them. Data is stored in open, plain-text, UTF-8 formats such as Markdown and JSON, with its vocabulary documented in [terms.md](terms.md), and stable identifiers and a documented schema will be preserved alongside the data so it can be read without any specific application.

## When principles meet

No principle stands alone, and none may be strengthened at another's expense. Openness comes first, because it is what makes the others verifiable. Where two principles pull against each other, we favor preservation over convenience.
