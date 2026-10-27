# Hadith Archive

Preserving hadith as source-bound textual occurrences.

## Documents

- [Soul](docs/soul.md): why Hadith Archive exists and what it must remain.
- [Terms](docs/terms.md): the core vocabulary.
- [Principles](docs/principles.md): the commitments the project upholds.
- [Layers](docs/layers.md): the layers data moves through.
- [Data model](docs/model.md): the entities and their relationships.
- [Schema](docs/schema.md): how data is stored, typed, validated and versioned.
- [Data policy](docs/data-policy.md): how core text is represented and verified.
- [Toolchain](docs/tooling.md): the software that reads and verifies core data.

## Verification

```sh
bun install --frozen-lockfile
git fetch origin main &&
base=$(git merge-base origin/main HEAD) &&
bun run check --base "$base"
```

`check` runs the toolchain checks and repository verification; `bun run verify --base "$base"` runs verification alone. Stage data and schema changes first, because verification reads the Git index, not the working tree. The base is always explicit, and the complete Git history is required. Base selection, shallow clones and post-merge checks are covered in the [toolchain](docs/tooling.md).

## Licence

Everything Hadith Archive made, its data, documents and code, is under the [Hadith Archive Licence](LICENSE), in Arabic and English: free for any use except what does not please Allah. The hadith texts themselves are centuries old and belong to no one. Outside works, such as the Arabic font and the icons, keep their own licences; see [CREDITS.md](CREDITS.md).

Hadith Archive does not redistribute the print editions it cites. Their typesetting, footnotes and editorial apparatus remain their publishers' own; the repository records which edition a text came from and where to look, so anyone can obtain the same book and check the page. See [Terms](docs/terms.md).
