# Data Policy

This document defines the single rule for how Open Hadith represents and verifies core text. Identifiers, records, and source witnesses are defined separately.

Open Hadith preserves the *representation* of a text — its exact characters in one uniform form — not the original bytes of its source.

## Canonical form

All core text is stored as UTF-8, without a byte-order mark (BOM), in Unicode Normalization Form C (NFC). Any source is converted to this form. The conversion is lossless: it changes how characters are encoded, never which characters are present. The compatibility forms (NFKC and NFKD) are never used, because they alter content.

Once in this form, a text has one and only one byte sequence. That single, unambiguous byte sequence is what makes the text hashable and verifiable.

## No removal

The canonical form unifies representation only. The core never removes or alters content — not diacritics, tatweel, or punctuation. Removing content is lossy and belongs to the application or derived layers, never the core.

## Storage and transfer

Data files are stored and transferred verbatim. Git records each file under the hash of its content and verifies that hash on every transfer, so what is committed is what every clone receives, byte for byte. Git applies no re-encoding or content filters to data files, and `.gitattributes` enforces LF line endings on every platform so no operating system introduces CRLF. The canonical bytes are therefore identical in every copy on every system, and the fingerprint verifies the same everywhere.

## Fingerprint

Each core text has a fingerprint: the SHA-256 hash of its canonical UTF-8 bytes, written as 64 lowercase hexadecimal characters. Because the representation is canonical and SHA-256 is fixed, the same text always produces the same fingerprint — on any machine, in any year. The fingerprint changes if any character changes, and it cannot be reversed to the text; it detects alteration, it does not store the text.
