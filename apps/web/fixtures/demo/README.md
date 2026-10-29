# Demo fixtures

Synthetic inputs for the generated demo site; `bun run build:demo` builds them into `artifacts/site/`.

- `core/` is laid out like the repository's `core/`, but none of it is a real record. Every text is the handwritten demo's labelled test prose, which states that it is not a hadith, and every book, author, edition, and ISBN is test metadata.
- `topics/` holds one project topic per file: `topic_id`, `title`, and the `hadith_ids` it groups; a hadith is listed in one topic at most. The titles are the demo's example categories. Their memberships are arbitrary demo assignments, not a classification.
- `site.json` names the site, its repository (`source_url`), and its public address (`url`, here the GitHub Pages address). Pages link under the address's path, so the same build works at `https://y3fai.github.io/hadith-archive/` or at a domain's root.

To see the build as GitHub Pages serves it, serve a folder that holds the output under the address's path, for example a `hadith-archive` link to `artifacts/site`, on 127.0.0.1.
