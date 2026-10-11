# Data Policy

This document defines the single rule for how Open Hadith represents and verifies core text. Identifiers, records, and source witnesses are defined separately.

Open Hadith preserves the *representation* of a text — its exact characters in one uniform form — not the original bytes of its source.

## Canonical form

All core text is stored as UTF-8, without a byte-order mark (BOM), in Unicode Normalization Form C (NFC). Every character is a Unicode scalar value: an unpaired UTF-16 surrogate, whether written literally or as a JSON `\uXXXX` escape, has no UTF-8 encoding and is rejected rather than replaced. Any source is converted to this form. NFC may change the underlying code-point sequence, but only to a canonically equivalent representation of the same text. The compatibility forms (NFKC and NFKD) are never used, because they alter content.

Once in this form, a text has one and only one byte sequence. That single, unambiguous byte sequence is what makes the text hashable and verifiable.

## Whitespace

Whitespace represents textual separation, not page geometry. A visible word separation is one ASCII space. A line wrap or page break inside continuing text becomes one ASCII space, while a genuine paragraph or separately printed report-body block is separated by one LF.

Core text has no leading or trailing whitespace, repeated spaces, consecutive LF characters, tabs, carriage returns, or non-breaking spaces. The presence or absence of separation around punctuation follows the printing, but the physical width of printed spacing is not represented. An ambiguous boundary is resolved by human review rather than silently normalized.

## Invisible format characters

Core text also never contains these invisible characters, which direct display or layout rather than record printed content:

- every Unicode `Bidi_Control` character: U+061C ARABIC LETTER MARK, U+200E LEFT-TO-RIGHT MARK, U+200F RIGHT-TO-LEFT MARK, U+202A–U+202E (directional embeddings, pop, and overrides), and U+2066–U+2069 (directional isolates and their pop);
- U+200B ZERO WIDTH SPACE, U+2060 WORD JOINER, and U+FEFF ZERO WIDTH NO-BREAK SPACE anywhere within a string.

A bidirectional control can make a page display characters in a different order than they are stored, and the three zero-width characters are layout directives that hide or suppress the word separation the ASCII space already records. Such a character is rejected, never removed or replaced automatically; a human decides the corrected text.

This list is exact, not a category. U+200C ZERO WIDTH NON-JOINER and U+200D ZERO WIDTH JOINER affect letter shaping and remain governed by the existing rules. Other format, private-use, or unassigned characters are not banned by this rule; extending the list is a governance decision.

## No removal

The canonical form unifies representation only. The core never removes or alters content — not diacritics, tatweel, or punctuation. Whitespace conversion excludes page layout rather than textual content. Removing content is lossy and belongs to the application or derived layers, never the core.

## Storage and transfer

Data files are stored and transferred verbatim. Git records each file under the hash of its content and verifies that hash on every transfer, so what is committed is what every clone receives, byte for byte. Git applies no re-encoding or content filters to data files, and `.gitattributes` enforces LF line endings on every platform so no operating system introduces CRLF. The canonical bytes are therefore identical in every copy on every system, and the fingerprint verifies the same everywhere.

## Fingerprint

Each core text has a fingerprint: the SHA-256 hash of its canonical UTF-8 bytes, written as 64 lowercase hexadecimal characters. Because the representation is canonical and SHA-256 is fixed, the same text always produces the same fingerprint — on any machine, in any year. The fingerprint changes if any character changes, and it cannot be reversed to the text; it detects alteration, it does not store the text.
