import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { DATA_PATH, hadithTexts } from "../scripts/data.ts";
import worker, { answer, type Env } from "../src/index.ts";
import { type Doc, MODEL, normalize, plain, prepare, preview, results, stem } from "../src/search.ts";

const data = JSON.parse(await readFile(DATA_PATH, "utf8")) as { model: string; hadith: Doc[] };
const vectorOf = (id: number) => (data.hadith.find((doc) => doc.id === id) as Doc).vector;
const ids = (query: string, vector?: readonly number[]) => answer(query, vector).map((result) => result.id);

describe("search data", () => {
  test("holds every HADITH's saved text exactly, each with a vector by the model the service asks", async () => {
    expect(data.model).toBe(MODEL);
    expect(data.hadith.map(({ vector: _, ...doc }) => doc)).toEqual(await hadithTexts());
    for (const doc of data.hadith) {
      expect(doc.vector).toHaveLength(768);
      expect(doc.vector.every(Number.isFinite)).toBe(true);
    }
  });
});

describe("words", () => {
  test("are compared without harakat, letter forms or prefixes and suffixes", () => {
    expect(plain("قَالَ ﷺ")).toBe("قال صلى الله عليه وسلم");
    expect(normalize("إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ")).toBe("انما الاعمال بالنيات");
    expect(stem("بالنيات")).toBe(stem("النيه"));
  });

  test("find a HADITH by its words, misspelt, joined or cut short", () => {
    expect(ids("إنما الأعمال بالنيات")[0]).toBe(1);
    expect(ids("انما الاعمال بالنيات")[0]).toBe(1);
    expect(ids("الاعمال بالنية")[0]).toBe(1);
    expect(ids("لاتغضب")[0]).toBe(16);
    expect(ids("احفض الله يحفضك")[0]).toBe(19);
  });
});

describe("results", () => {
  test("by words alone take texts that match some words when none matches all", () => {
    expect(ids("إنما الأعمال بالنيات")).toEqual([1]);
    expect(ids("الأعمال كلمةتجريبية").length).toBeGreaterThan(0);
    // The search page runs the same, on texts without vectors.
    const texts = data.hadith.map(({ vector: _, ...text }) => text);
    expect(results(prepare(texts), "لا تغضب")).toEqual(answer("لا تغضب", undefined));
  });

  test("put the texts that match every word first, then the five closest by meaning", () => {
    const near = ids("كلمةتجريبية", vectorOf(7));
    expect(near).toHaveLength(5);
    expect(near[0]).toBe(7);
    const found = ids("إنما الأعمال بالنيات", vectorOf(16));
    expect(found[0]).toBe(1);
    expect(found).toHaveLength(6);
    expect(new Set(found).size).toBe(6);
  });
});

describe("preview", () => {
  // Invented test text, not a hadith.
  const doc = { id: 0, text: "قال الراوي في نص تجريبي: هذا كلام تجريبي ﷺ", words: 25 };
  const searcher = prepare(data.hadith);

  test("sets the searched words apart, by stem or root, and not small words or ﷺ", () => {
    expect(preview(searcher, doc, "كلام")).toEqual(["قال الراوي في نص تجريبي: هذا ", "كلام", " تجريبي ﷺ"]);
    expect(preview(searcher, doc, "في النص")).toEqual(["قال الراوي في ", "نص", " تجريبي: هذا كلام تجريبي ﷺ"]);
    expect(preview(searcher, doc, "وسلم")).toEqual(["… هذا كلام تجريبي ﷺ"]);
  });

  test("starts at the Prophet's words when no searched word is in the text", () => {
    expect(preview(searcher, doc, "كلمةتجريبية")).toEqual(["… هذا كلام تجريبي ﷺ"]);
    expect(preview(searcher, { id: 0, text: doc.text }, "كلمةتجريبية")).toEqual([doc.text]);
  });
});

describe("service", () => {
  const kept: string[] = [];
  (globalThis as Record<string, unknown>)["caches"] = {
    default: {
      match: async () => undefined,
      put: async (request: Request) => { kept.push(request.url); },
    },
  };
  const env = (vector: readonly number[] | undefined): Env => ({
    AI: {
      run: async () => {
        if (vector === undefined) throw new Error("test: no Workers AI");
        return { data: [vector] };
      },
    },
    CF_VERSION_METADATA: { id: "test" },
  });
  const pending: Promise<unknown>[] = [];
  const ask = (path: string, vector?: readonly number[]) =>
    worker.fetch(new Request(`https://search.test${path}`), env(vector), { waitUntil: (promise) => pending.push(promise) });

  test("answers any page with the results, and keeps those that used meaning", async () => {
    const response = await ask(`/?q=${encodeURIComponent("  لا  تغضب ")}`, vectorOf(16));
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(await response.json()).toEqual({ results: answer("لا تغضب", vectorOf(16)) });
    await Promise.all(pending);
    expect(kept).toEqual([`https://search.test/?q=${encodeURIComponent("لا تغضب")}&v=test`]);
  });

  test("answers by words alone, not kept, when Workers AI fails", async () => {
    const response = await ask(`/?q=${encodeURIComponent("لا تغضب")}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ results: answer("لا تغضب", undefined) });
  });

  test("answers an empty query with no results, and any other address with 404", async () => {
    expect(await (await ask("/?q=%20")).json()).toEqual({ results: [] });
    expect((await ask("/other?q=x")).status).toBe(404);
  });
});
