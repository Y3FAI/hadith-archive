import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { formatCanonicalJson } from "../../../packages/canonical-json/src/index.ts";
import { ASSET_PATHS, ASSETS_DIRECTORY, buildSite, type BuildResult } from "../src/build.ts";
import { REPOSITORY_ROOT } from "../src/inputs.ts";

const FIXTURE = resolve(REPOSITORY_ROOT, "apps/web/fixtures/demo");
const scratch = await mkdtemp(join(tmpdir(), "hadith-archive-site-"));
let counter = 0;

afterAll(async () => {
  await rm(scratch, { force: true, recursive: true });
});

async function freshDirectory(): Promise<string> {
  counter += 1;
  const directory = join(scratch, String(counter));
  await mkdir(directory);
  return directory;
}

/** A private copy of the demo fixtures that a test may change. */
async function fixtureCopy(): Promise<string> {
  const root = await freshDirectory();
  await cp(FIXTURE, root, { recursive: true });
  return root;
}

function build(root: string, out: string): Promise<BuildResult> {
  return buildSite({
    core: join(root, "core"),
    out,
    site: join(root, "site.json"),
    topics: join(root, "topics"),
  });
}

async function readTree(root: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      files.set(path.slice(root.length + 1), await readFile(path));
    }
  }
  return new Map([...files].sort(([left], [right]) => left < right ? -1 : 1));
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, formatCanonicalJson(value as never));
}

const fingerprint = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const occurrencePath = (root: string, book: number, id: number) =>
  join(root, `core/sources/demo-book-${book}/witnesses/demo-book-${book}-demo-edition/occurrences/${id}.json`);

async function refusal(root: string): Promise<string[]> {
  const out = join(await freshDirectory(), "site");
  const result = await build(root, out);
  expect(result.kind).toBe("refused");
  // A refused build writes nothing.
  expect(await readdir(out).catch(() => "absent")).toBe("absent");
  return result.kind === "refused"
    ? result.findings.map((item) => `${item.rule ?? item.file.split("/").pop()} ${item.path} ${item.message}`)
    : [];
}

const demoBuild = await (async () => {
  const out = join(await freshDirectory(), "site");
  const result = await build(FIXTURE, out);
  return { files: await readTree(out), out, result };
})();
const page = (path: string) => (demoBuild.files.get(path) as Buffer).toString("utf8");
const pages = () => [...demoBuild.files.keys()].filter((path) => path.endsWith(".html"));

describe("demo build", () => {
  test("builds every page and asset from the saved fixtures", () => {
    expect(demoBuild.result.kind).toBe("built");
    expect([...demoBuild.files.keys()]).toEqual([
      "about/index.html",
      ...[1, 2, 3].flatMap((book) => [
        `b/demo-book-${book}/bab-1/index.html`,
        `b/demo-book-${book}/bab-2/index.html`,
        `b/demo-book-${book}/index.html`,
      ]),
      "b/demo-book-4/index.html",
      "b/index.html",
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((topic) => `c/${topic}/index.html`),
      "c/index.html",
      "font/UthmanTN_v2-0.ttf",
      "font/UthmanTN_v2-0.woff2",
      ...[1, 2, 3, 4].map((hadith) => `h/${hadith}/index.html`),
      "index.html",
      "script.js",
      "search/index.html",
      "style.css",
    ]);
  });

  test("copies the demo's CSS, script, and font bytes unchanged", async () => {
    for (const path of ASSET_PATHS) {
      expect(demoBuild.files.get(path)?.equals(await readFile(resolve(ASSETS_DIRECTORY, path))))
        .toBe(true);
    }
  });

  test("keeps every page Arabic, right to left, noindex, and offline", () => {
    for (const path of pages()) {
      const html = page(path);
      expect(html).toStartWith("<!doctype html>\n<html lang=\"ar\" dir=\"rtl\">");
      expect(html).toContain("<meta name=\"robots\" content=\"noindex\">");
      expect(html).toContain("<link rel=\"stylesheet\" href=\"/style.css\">");
      expect(html).toContain("href=\"/font/UthmanTN_v2-0.woff2\"");
      expect(html).toContain("<script src=\"/script.js\"></script>");
      const remote = [...html.matchAll(/ (?:href|src|action)="([^"]+)"/g)]
        .map((match) => match[1] as string)
        .filter((url) => !url.startsWith("/"));
      expect(remote.every((url) => url.startsWith("https://github.com/Y3FAI/hadith-archive"))).toBe(true);
    }
  });

  test("uses only the demo's own icons", async () => {
    const demo = (await Promise.all(["index.html", "hadith.html", "about.html"].map((file) =>
      readFile(resolve(ASSETS_DIRECTORY, file), "utf8")
    ))).join("");
    for (const path of pages()) {
      for (const [icon] of page(path).matchAll(/<svg[^>]*>.*?<\/svg>/g)) {
        expect(demo).toContain(icon);
      }
    }
  });

  test("keeps the owner's about text exactly", async () => {
    const main = (html: string) => /<main>([\s\S]*)<\/main>/.exec(html)?.[1];
    const demo = await readFile(resolve(ASSETS_DIRECTORY, "about.html"), "utf8");
    expect(main(page("about/index.html"))).toBe(main(demo) as string);
  });

  test("shows the saved quotation and the members in mechanical order", async () => {
    const saved = await readJson(join(FIXTURE, "core/hadith/1.json"));
    const hadith = page("h/1/index.html");
    expect(hadith).toContain(`<h1>${saved["text"]}</h1>`);
    const order = [...hadith.matchAll(/<li id="occurrence-(\d+)">/g)].map((match) => match[1]);
    expect(order).toEqual(["1", "3", "6"]);
    expect(hadith).toContain("<div><dt>الصفحة</dt><dd>١١٠–١١١</dd></div>");
    expect(hadith).toContain("<div><dt>رقم الحديث</dt><dd>١٢٤٥</dd></div>");
    // A stored LF inside the text is kept as a line break.
    expect(page("h/2/index.html")).toMatch(/<h1>[^<]+<br>[^<]+<\/h1>/);
  });

  test("lists topics and their hadith by identifier, with no copied membership", () => {
    const tiles = [...page("c/index.html").matchAll(/<a href="\/c\/(\d+)\/">([^<]+)<\/a>/g)]
      .map((match) => `${match[1]} ${match[2]}`);
    expect(tiles).toEqual([
      "1 الإيمان", "2 الطهارة", "3 الصلاة", "4 الزكاة",
      "5 الصيام", "6 الحج", "7 الأذكار", "8 الأخلاق",
    ]);
    const listed = [...page("c/7/index.html").matchAll(/<li id="hadith-(\d+)">/g)].map((match) => match[1]);
    expect(listed).toEqual(["1", "4"]);
  });

  test("renders every occurrence, linking only grouped ones to a hadith", async () => {
    const html = pages().map(page).join("\n");
    for (let id = 1; id <= 9; id += 1) {
      expect(html).toContain(`<li id="occurrence-${id}">`);
    }
    const section = page("b/demo-book-2/bab-1/index.html");
    const ungrouped = section.slice(section.indexOf("<li id=\"occurrence-4\">"));
    expect(ungrouped).not.toContain("<dt>الحديث</dt>");
    expect(section).toContain("<div><dt>الحديث</dt><dd><a href=\"/h/1/\">١</a></dd></div>");
    // A source without sections lists its narrations on its own page.
    const book = page("b/demo-book-4/index.html");
    expect(book).toContain("<li id=\"occurrence-8\">");
    expect(book).toContain("<li id=\"occurrence-9\">");
    expect(book).not.toContain("<dt>الجزء</dt>");
    expect(book).not.toContain("<dt>رقم الحديث</dt>");
  });

  test("reaches every page from the home page, and every link resolves", () => {
    const reached = new Set<string>(["index.html"]);
    const queue = ["index.html"];
    while (queue.length > 0) {
      const html = page(queue.shift() as string);
      for (const [, href] of html.matchAll(/ (?:href|action)="(\/[^"#]*)"/g)) {
        const file = `${(href as string).slice(1)}${(href as string).endsWith("/") ? "index.html" : ""}`;
        expect(demoBuild.files.has(file)).toBe(true);
        if (file.endsWith(".html") && !reached.has(file)) {
          reached.add(file);
          queue.push(file);
        }
      }
    }
    expect([...reached].sort()).toEqual(pages().sort());
  });

  test("answers the search form with a page stating that search is not available", () => {
    expect(page("index.html")).toContain("<form action=\"/search/\">");
    expect(page("search/index.html")).toContain("<p>البحث غير متاح في هذا العرض التجريبي.</p>");
  });
});

describe("reproducibility and output safety", () => {
  test("is byte-identical across builds and input locations", async () => {
    const moved = await fixtureCopy();
    const out = join(await freshDirectory(), "elsewhere");
    expect((await build(moved, out)).kind).toBe("built");
    const again = await readTree(out);
    expect([...again.keys()]).toEqual([...demoBuild.files.keys()]);
    for (const [path, bytes] of demoBuild.files) {
      expect(again.get(path)?.equals(bytes)).toBe(true);
    }
  });

  test("leaves its inputs unchanged", async () => {
    const root = await fixtureCopy();
    const before = await readTree(root);
    expect((await build(root, join(root, "..", "site"))).kind).toBe("built");
    expect(await readTree(root)).toEqual(before);
  });

  test("refuses a non-empty output directory without touching it", async () => {
    const out = await freshDirectory();
    await writeFile(join(out, "index.html"), "owner file");
    const result = await build(FIXTURE, out);
    expect(result.kind).toBe("refused");
    expect(await readFile(join(out, "index.html"), "utf8")).toBe("owner file");
    expect(await readdir(out)).toEqual(["index.html"]);
  });

  test("refuses an output inside or around an input", async () => {
    const root = await fixtureCopy();
    for (const out of [join(root, "core", "site"), join(root, "topics", "site"), root, ASSETS_DIRECTORY]) {
      const result = await build(root, out);
      expect(result.kind).toBe("refused");
      if (result.kind === "refused") {
        expect(result.findings.some((item) => item.message.startsWith("Output directory overlaps"))).toBe(true);
      }
    }
    expect(await readdir(join(root, "core"))).toEqual(["hadith", "sources"]);
  });
});

describe("core input validation", () => {
  test("loads the saved single-text records", async () => {
    const saved = await readJson(join(FIXTURE, "core/hadith/2.json"));
    expect(Object.keys(saved)).toEqual([
      "display_occurrence_id", "hadith_id", "member_occurrence_ids",
      "record_type", "schema_version", "text",
    ]);
    expect(String(saved["text"])).toContain("\n");
    expect(demoBuild.result.kind).toBe("built");
  });

  test("refuses unresolved display and member occurrences", async () => {
    const root = await fixtureCopy();
    const path = join(root, "core/hadith/3.json");
    await writeJson(path, { ...await readJson(path), display_occurrence_id: 99, member_occurrence_ids: [5, 7, 98] });
    const findings = await refusal(root);
    expect(findings).toContain("reference.display_occurrence_resolves /display_occurrence_id Display occurrence does not resolve uniquely");
    expect(findings).toContain("reference.member_occurrence_resolves /member_occurrence_ids/2 Member occurrence does not resolve uniquely");
    expect(findings).toContain("hadith.display_is_member /display_occurrence_id Display occurrence is not a hadith member");
  });

  test("refuses a saved text that is not an exact display span", async () => {
    const root = await fixtureCopy();
    const path = join(root, "core/hadith/2.json");
    const saved = await readJson(path);
    // The stored LF replaced by a space no longer matches.
    await writeJson(path, { ...saved, text: String(saved["text"]).replace("\n", " ") });
    expect(await refusal(root)).toEqual([
      "hadith.text_span /text text is not an exact display-occurrence span",
    ]);
  });

  test("refuses a raw text that no longer matches its fingerprint", async () => {
    const root = await fixtureCopy();
    const path = occurrencePath(root, 2, 4);
    const saved = await readJson(path);
    await writeJson(path, { ...saved, raw_text: `${saved["raw_text"]} زيادة` });
    expect(await refusal(root)).toEqual([
      "occurrence.fingerprint_matches /fingerprint Fingerprint does not match raw_text",
    ]);
  });

  test("refuses the legacy title, heading, and description fields", async () => {
    const root = await fixtureCopy();
    const path = join(root, "core/hadith/4.json");
    const { text, ...rest } = await readJson(path);
    await writeJson(path, { ...rest, description: text, heading: text, title: text });
    const findings = await refusal(root);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((item) => item.startsWith("record.schema_valid "))).toBe(true);
  });

  test("refuses an empty core input and a symlinked record", async () => {
    const empty = await fixtureCopy();
    await rm(join(empty, "core"), { recursive: true });
    await mkdir(join(empty, "core"));
    expect(await refusal(empty)).toEqual(["core  Core input contains no records"]);

    const linked = await fixtureCopy();
    const path = join(linked, "core/hadith/4.json");
    await rm(path);
    await symlink(join(FIXTURE, "core/hadith/4.json"), path);
    expect(await refusal(linked)).toContainEqual(
      expect.stringContaining("Input entry is not a regular file or directory"),
    );
  });
});

describe("topic input validation", () => {
  async function topicRefusal(change: (topics: string) => Promise<void>): Promise<string[]> {
    const root = await fixtureCopy();
    await change(join(root, "topics"));
    return refusal(root);
  }

  test("refuses membership that is unresolved, repeated, unordered, or empty", async () => {
    expect(await topicRefusal(async (topics) => {
      await writeJson(join(topics, "1.json"), { hadith_ids: [1, 9], title: "الإيمان", topic_id: 1 });
      await writeJson(join(topics, "2.json"), { hadith_ids: [2, 2], title: "الطهارة", topic_id: 2 });
      await writeJson(join(topics, "3.json"), { hadith_ids: [3, 1], title: "الصلاة", topic_id: 3 });
      await writeJson(join(topics, "4.json"), { hadith_ids: [], title: "الزكاة", topic_id: 4 });
    })).toEqual([
      "1.json /hadith_ids/1 Hadith identifier does not resolve to a hadith record",
      "2.json /hadith_ids/1 hadith_ids must be in strictly ascending numeric order",
      "3.json /hadith_ids/1 hadith_ids must be in strictly ascending numeric order",
      "4.json /hadith_ids hadith_ids must be a nonempty array",
    ]);
  });

  test("refuses mismatched identifiers, duplicate titles, and unknown or missing properties", async () => {
    expect(await topicRefusal(async (topics) => {
      await writeJson(join(topics, "1.json"), { hadith_ids: [1], title: "الإيمان", topic_id: 9 });
      await writeJson(join(topics, "2.json"), { hadith_ids: [2], title: "الصلاة", topic_id: 2 });
      await writeJson(join(topics, "4.json"), { hadith_ids: [3], note: "x", title: "الزكاة", topic_id: 4 });
      await writeJson(join(topics, "5.json"), { hadith_ids: [4], topic_id: 5 });
      await writeJson(join(topics, "6.json"), { hadith_ids: [4], title: " الحج", topic_id: 6 });
    })).toEqual([
      "1.json /topic_id topic_id does not match the file name",
      "2.json /title Topic title is not unique",
      "3.json /title Topic title is not unique",
      "4.json /note Unknown topic property",
      "5.json  Missing topic property title",
      "6.json /title title must be nonempty single-line text",
    ]);
  });

  test("refuses misnamed, non-canonical, nested, and linked topic entries", async () => {
    const findings = await topicRefusal(async (topics) => {
      await writeFile(join(topics, "iman.json"), "{}\n");
      await writeFile(join(topics, "1.json"), "{\"hadith_ids\":[1,2],\"title\":\"الإيمان\",\"topic_id\":1}\n");
      await mkdir(join(topics, "nested"));
      await writeJson(join(topics, "nested", "9.json"), { hadith_ids: [1], title: "مكرر", topic_id: 9 });
      await symlink(join(topics, "2.json"), join(topics, "10.json"));
    });
    expect(findings).toContainEqual(expect.stringMatching(/^iman\.json .*named <topic_id>\.json/));
    expect(findings).toContainEqual(expect.stringMatching(/^9\.json .*named <topic_id>\.json/));
    expect(findings).toContainEqual(expect.stringMatching(/^1\.json .*not canonical JSON/));
    expect(findings).toContainEqual(expect.stringMatching(/^10\.json .*not a regular file/));
  });

  test("refuses a missing topics directory", async () => {
    expect(await topicRefusal((topics) => rm(topics, { recursive: true })))
      .toEqual(["topics  Input directory does not exist"]);
  });
});

describe("site configuration", () => {
  test("accepts deployment settings it does not render", async () => {
    const root = await fixtureCopy();
    await writeFile(join(root, "site.json"), JSON.stringify({
      domain: "https://example.org",
      name: "اسم تجريبي",
      redirect_domains: ["example.com"],
      source_url: "https://example.org/repository",
    }));
    const out = join(await freshDirectory(), "site");
    expect((await build(root, out)).kind).toBe("built");
    const home = await readFile(join(out, "index.html"), "utf8");
    expect(home).toContain("<title>اسم تجريبي</title>");
    expect(home).toContain("<a href=\"https://example.org/repository/blob/main/LICENSE\" rel=\"nofollow\">الرخصة</a>");
    expect(home).not.toContain("example.com");
  });

  test("refuses unknown keys, unsafe URLs, and malformed names", async () => {
    const root = await fixtureCopy();
    await writeFile(join(root, "site.json"), JSON.stringify({
      analytics: "x",
      domain: "https://example.org/path",
      name: "",
      redirect_domains: ["Example.com"],
      source_url: "http://example.org/",
    }));
    expect(await refusal(root)).toEqual([
      "site.json /analytics Unknown site configuration property",
      "site.json /domain domain must be an https origin",
      "site.json /name name must be nonempty single-line text",
      "site.json /redirect_domains redirect_domains must be an array of lowercase host names",
      "site.json /source_url source_url must be an https URL without a trailing slash, query, or fragment",
    ]);
  });
});

describe("escaping", () => {
  test("escapes every saved value in text and attributes", async () => {
    const root = await fixtureCopy();
    const markup = "<script>alert(\"x\")</script> & 'y'";
    const sourcePath = join(root, "core/sources/demo-book-2/source.json");
    await writeJson(sourcePath, { ...await readJson(sourcePath), author: markup, title: markup });
    const path = occurrencePath(root, 2, 4);
    const rawText = `${(await readJson(path))["raw_text"]} <b>&amp;</b>`;
    await writeJson(path, { ...await readJson(path), fingerprint: fingerprint(rawText), raw_text: rawText });
    await writeJson(join(root, "topics/8.json"), { hadith_ids: [2, 3], title: "<i>الأخلاق</i>", topic_id: 8 });
    await writeFile(join(root, "site.json"), JSON.stringify({
      name: "أرشيف \"الحديث\"", source_url: "https://example.org/a\"b",
    }));
    const out = join(await freshDirectory(), "site");
    // A quote is not valid in a URL path, so the URL parser rejects it first.
    expect((await build(root, out)).kind).toBe("refused");
    await writeFile(join(root, "site.json"), JSON.stringify({
      name: "أرشيف <الحديث>", source_url: "https://example.org/a&b",
    }));
    expect((await build(root, out)).kind).toBe("built");
    const html = (await Promise.all([...(await readTree(out)).entries()]
      .filter(([file]) => file.endsWith(".html"))
      .map(([, bytes]) => bytes.toString("utf8")))).join("\n");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<i>");
    expect(html).not.toContain("<الحديث>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
    expect(html).toContain("&lt;b&gt;&amp;amp;&lt;/b&gt;");
    expect(html).toContain("&lt;i&gt;الأخلاق&lt;/i&gt;");
    expect(html).toContain("href=\"https://example.org/a&amp;b\"");
  });
});

describe("command line", () => {
  async function run(...args: string[]) {
    const child = Bun.spawn(["bun", "run", resolve(REPOSITORY_ROOT, "apps/web/src/main.ts"), ...args], {
      stderr: "pipe",
      stdout: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { code, stderr, stdout };
  }

  test("requires every option", async () => {
    const result = await run("--core", join(FIXTURE, "core"));
    expect(result.code).toBe(2);
    expect(result.stderr).toStartWith("Usage:");
  });

  test("reports refused inputs and builds valid ones", async () => {
    const root = await fixtureCopy();
    const options = ["--core", join(root, "core"), "--topics", join(root, "topics"), "--site", join(root, "site.json")];
    const out = join(await freshDirectory(), "site");
    await writeJson(join(root, "topics/1.json"), { hadith_ids: [99], title: "الإيمان", topic_id: 1 });
    const refused = await run(...options, "--out", out);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("/hadith_ids/0: Hadith identifier does not resolve to a hadith record");
    expect(refused.stderr).toContain("Build refused; nothing was written.");
    await writeJson(join(root, "topics/1.json"), { hadith_ids: [1, 2], title: "الإيمان", topic_id: 1 });
    const built = await run(...options, "--out", out);
    expect(built.code).toBe(0);
    expect(built.stdout).toBe(`Built 31 files into ${out}\n`);
  });
});
