// Writes apps/search/data.json, the search service's copy of every HADITH's
// saved text with its vector by meaning: bun run search:data
// The texts come from core. A text already in the file keeps its vector;
// new and changed texts are embedded by Workers AI through the local Worker
// in src/embed.ts, started first in another terminal:
//   cd apps/search && wrangler dev src/embed.ts --ip 127.0.0.1
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadInputs, REPOSITORY_ROOT } from "../../web/src/inputs.ts";
import { searchTexts } from "../../web/src/render.ts";
import { type Doc, MODEL, type SearchText } from "../src/search.ts";

export const DATA_PATH = resolve(REPOSITORY_ROOT, "apps/search/data.json");
const EMBED = "http://127.0.0.1:8787/";
// Workers AI embeds at most this many texts at once.
const BATCH = 32;

/** Every HADITH's saved text, as the site's search page has it. */
export async function hadithTexts(): Promise<SearchText[]> {
  const loaded = await loadInputs({
    core: resolve(REPOSITORY_ROOT, "core"),
    site: resolve(REPOSITORY_ROOT, "config/site.json"),
    topics: resolve(REPOSITORY_ROOT, "topics"),
  });
  if (!loaded.ok) {
    throw new Error(loaded.findings.map((finding) => `${finding.file}${finding.path}: ${finding.message}`).join("\n"));
  }
  return searchTexts(loaded.inputs.core);
}

async function embed(texts: readonly string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const response = await fetch(EMBED, { body: JSON.stringify(texts.slice(i, i + BATCH)), method: "POST" }).catch(() => {
      throw new Error(`No Worker at ${EMBED}; start it with: cd apps/search && wrangler dev src/embed.ts --ip 127.0.0.1`);
    });
    if (!response.ok) {
      throw new Error(`Workers AI: ${response.status} ${await response.text()}`);
    }
    vectors.push(...(await response.json()) as number[][]);
  }
  return vectors;
}

if (import.meta.main) {
  const texts = await hadithTexts();
  const saved = await readFile(DATA_PATH, "utf8")
    .then((text) => JSON.parse(text) as { model: string; hadith: Doc[] })
    .catch(() => undefined);
  const kept = new Map(saved?.model === MODEL ? saved.hadith.map((doc) => [doc.text, doc.vector]) : []);
  const missing = texts.filter((doc) => !kept.has(doc.text));
  const made = await embed(missing.map((doc) => doc.text));
  missing.forEach((doc, i) => kept.set(doc.text, (made[i] as number[]).map((value) => Math.round(value * 1e5) / 1e5)));
  // One HADITH per line, so a change shows as that line.
  const lines = texts.map((doc) => JSON.stringify({ ...doc, vector: kept.get(doc.text) }));
  await writeFile(DATA_PATH, `{\n  "model": ${JSON.stringify(MODEL)},\n  "hadith": [\n    ${lines.join(",\n    ")}\n  ]\n}\n`);
  console.log(`${DATA_PATH}: ${texts.length} HADITH, ${missing.length} embedded`);
}
