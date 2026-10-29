# Demo fixtures

Synthetic inputs for the generated demo site; `bun run build:demo` builds them into `artifacts/site/`.

- `core/` is laid out like the repository's `core/`, but none of it is a real record. Every text is the handwritten demo's labelled test prose, which states that it is not a hadith, and every book, author, edition, and ISBN is test metadata.
- `topics/` holds one project topic per file: `topic_id`, `title`, and the `hadith_ids` it groups. The titles are the demo's example categories. Their memberships are arbitrary demo assignments, not a classification.
- `site.json` is the site configuration the demo pages use.
