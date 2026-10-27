# hadith-archive

Preserving hadith as source-bound textual occurrences.

## Verification

Install dependencies with `bun install --frozen-lockfile`. Repository verification checks **staged Git contents** against an explicit accepted base. On a feature branch targeting `main`, fetch the target branch, capture the common ancestor, and stage candidate data and schema changes with `git add` or `git rm`:

```sh
git fetch origin main &&
base=$(git merge-base origin/main HEAD) &&
bun run check --base "$base"
```

`check` runs the toolchain checks and forwards `--base` to repository verification. To run only repository verification, use `bun run verify --base "$base"`. There is no implicit base: omitting it exits with status `2` rather than reporting a valid repository.

Verification requires the complete Git history. A shallow clone hides earlier commits, so the verifier refuses it and exits with status `2` instead of reporting on truncated history; it never fetches history itself. Recover with `git fetch --unshallow` and rerun with the same explicit base. In GitHub Actions, check out with `actions/checkout` and `fetch-depth: 0`.

Before merging, update the feature branch against the latest target branch and verify again. For verification after a merge, supply the accepted target commit from **before** the merge; using the new `main` tip as its own base would treat the new identifiers as already accepted. Do not use a feature branch's `HEAD^` as the accepted base: it includes draft commits and can hide invalid identifiers introduced earlier in the branch.

Unstaged changes are excluded from the repository report. Core and schema symlinks and submodules are rejected. See [the toolchain contract](docs/tooling.md).

## License

Everything Hadith Archive made, its data, documents and code, is under the [Hadith Archive Licence](LICENSE), in Arabic and English. The hadith texts themselves are centuries old and belong to no one. The Arabic font and the icons are outside works under their own licences; see [CREDITS.md](CREDITS.md).

Hadith Archive does not redistribute the print editions it cites. Their typesetting, footnotes, and editorial apparatus remain their publishers' own; this repository records which edition a text came from and where in it to look, so that anyone may obtain the same book and check the page. See [docs/terms.md](docs/terms.md).
