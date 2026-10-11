# open-hadith

Preserving hadith as source-bound textual occurrences.

## Verification

Install dependencies with `bun install --frozen-lockfile` and run `bun run check` for the toolchain checks. Repository verification checks **staged Git contents**. Stage candidate data and schema changes with `git add` or `git rm`, then run:

```sh
bun run packages/verifier/src/main.ts --base <accepted-base-commit>
```

Unstaged changes are excluded from the repository report. Core and schema symlinks and submodules are rejected. See [the toolchain contract](docs/tooling.md).

## License

This repository holds two kinds of work, licensed separately.

**Data and documentation — [CC0 1.0 Universal](LICENSE).** The preserved text, witness definitions, identifiers, and the documents in `docs/` are dedicated to the public domain. The hadith texts themselves are centuries old and already free of copyright; Open Hadith claims nothing over them, and waives whatever thin rights might otherwise attach to its own selection, arrangement, and metadata — including database rights.

**Code — [MIT](LICENSE-CODE).** Ingestion, verification, and any other tooling.

Open Hadith does not redistribute the print editions it cites. Their typesetting, footnotes, and editorial apparatus remain their publishers' own; this repository records which edition a text came from and where in it to look, so that anyone may obtain the same book and check the page. See [docs/terms.md](docs/terms.md).
