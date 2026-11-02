import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { exportCsv, exportJsonl } from "../src/export.ts";
import { loadInputs, REPOSITORY_ROOT, type SiteInputs } from "../src/inputs.ts";

const FIXTURE = resolve(REPOSITORY_ROOT, "apps/web/fixtures/demo");
const loaded = await loadInputs({
  core: join(FIXTURE, "core"),
  site: join(FIXTURE, "site.json"),
  topics: join(FIXTURE, "topics"),
});
if (!loaded.ok) throw new Error("the demo fixtures did not load");
const inputs = loaded.inputs;
const record = async (path: string) => JSON.parse(await readFile(join(FIXTURE, "core", path), "utf8"));
const OCCURRENCE_1 = "sources/demo-book-1/witnesses/demo-book-1-demo-edition/occurrences/1.json";

describe("JSONL export", () => {
  const lines = exportJsonl(inputs).split("\n");

  test("writes one line per HADITH, by identifier, and is the same every time", () => {
    expect(lines.pop()).toBe("");
    expect(lines.map((line) => JSON.parse(line).hadith.hadith_id)).toEqual([1, 2, 3, 4]);
    expect(exportJsonl(inputs)).toBe(exportJsonl(inputs));
  });

  test("copies each record verbatim and resolves every citation", async () => {
    const first = JSON.parse(lines[0] as string);
    expect(first.hadith).toEqual(await record("hadith/1.json"));
    expect(first.url).toBe("https://y3fai.github.io/hadith-archive/h/1/");
    expect(first.topic).toEqual({ title: "الإيمان", topic_id: 1 });
    expect(first.occurrences.map((member: { occurrence: { occurrence_id: number } }) => member.occurrence.occurrence_id))
      .toEqual([1, 3, 6]);
    const [member] = first.occurrences;
    expect(member.occurrence).toEqual(await record(OCCURRENCE_1));
    expect(member.witness).toEqual(await record("sources/demo-book-1/witnesses/demo-book-1-demo-edition/witness.json"));
    expect(member.source).toEqual(await record("sources/demo-book-1/source.json"));
    expect(member.section).toEqual(await record("sources/demo-book-1/sections/bab-1.json"));
    expect(member.collations).toEqual([]);
  });

  test("gives each COLLATION the printing it compares", () => {
    const collation = {
      differences: [],
      location: { page_end: 7, page_start: 7 },
      occurrence_id: 1,
      record_type: "collation",
      schema_version: 1,
      span_end: 10,
      span_start: 0,
      witness_id: "demo-book-2-demo-edition",
    };
    const compared = { ...inputs, core: { ...inputs.core, collations: [collation] } } as unknown as SiteInputs;
    const first = JSON.parse(exportJsonl(compared).split("\n")[0] as string);
    expect(first.occurrences[0].collations).toEqual([{
      collation,
      witness: inputs.core.witnesses.find((witness) => witness.witness_id === "demo-book-2-demo-edition"),
    }]);
  });
});

describe("CSV export", () => {
  const csv = exportCsv(inputs);

  test("opens with a byte order mark and a header, one row per OCCURRENCE", () => {
    expect(csv).toStartWith("﻿\"hadith_id\",\"url\",\"hadith_text\",\"topic\",\"occurrence_id\",");
    // Rows end in CRLF; a narration's own line breaks are bare LF inside quotes.
    const rows = csv.split("\r\n");
    expect(rows.pop()).toBe("");
    expect(rows).toHaveLength(1 + 8);
    expect(rows.slice(1).map((row) => Number(/^"(\d+)","[^"]*","[^"]*","[^"]*","(\d+)"/.exec(row)?.[2])))
      .toEqual([1, 3, 6, 2, 8, 5, 7, 9]);
  });

  test("quotes every field, doubling quotes, and keeps the stored text exact", async () => {
    const occurrence = await record(OCCURRENCE_1);
    expect(csv).toContain(`"${occurrence.raw_text.replaceAll("\"", "\"\"")}","${occurrence.fingerprint}"\r\n`);
    const quoted = { ...inputs, topics: [{ hadith_ids: [1], title: "قسم \"تجريبي\", ثان", topic_id: 1 }] };
    expect(exportCsv(quoted)).toContain(",\"قسم \"\"تجريبي\"\", ثان\",");
  });
});
