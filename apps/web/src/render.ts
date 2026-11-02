import type {
  CollationRecord,
  HadithRecord,
  OccurrenceRecord,
  SectionRecord,
  SourceRecord,
  SourceWitnessRecord,
} from "../../../packages/core-loader/src/index.ts";

import { createHash } from "node:crypto";

import type { SiteInputs, Topic } from "./inputs.ts";

// Phosphor thin icons, exactly as in the handwritten demo; caretRight is its
// caretLeft mirrored, for the previous page.
const svg = (path: string) =>
  `<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
const ICON = {
  arrow: svg("M220,128a4,4,0,0,1-4,4H49.66l65.17,65.17a4,4,0,0,1-5.66,5.66l-72-72a4,4,0,0,1,0-5.66l72-72a4,4,0,0,1,5.66,5.66L49.66,124H216A4,4,0,0,1,220,128Z"),
  bookmark: svg("M184,36H72A12,12,0,0,0,60,48V224a4,4,0,0,0,6.12,3.39L128,188.72l61.89,38.67A4,4,0,0,0,192,228a4.06,4.06,0,0,0,1.94-.5A4,4,0,0,0,196,224V48A12,12,0,0,0,184,36Zm4,180.78-57.89-36.17a4,4,0,0,0-4.24,0L68,216.78V48a4,4,0,0,1,4-4H184a4,4,0,0,1,4,4Z"),
  books: svg("M104,36H56A12,12,0,0,0,44,48V208a12,12,0,0,0,12,12h48a12,12,0,0,0,12-12V48A12,12,0,0,0,104,36ZM52,76h56V180H52Zm4-32h48a4,4,0,0,1,4,4V68H52V48A4,4,0,0,1,56,44Zm48,168H56a4,4,0,0,1-4-4V188h56v20A4,4,0,0,1,104,212Zm123.74-16.62L194.55,37.57a12,12,0,0,0-14.25-9.3L133.49,38.32a12.1,12.1,0,0,0-9.23,14.3l33.19,157.81a12,12,0,0,0,14.25,9.3l46.81-10.06h0A12.08,12.08,0,0,0,227.74,195.38Zm-83.21-85.27,54.63-11.73,15,71.07-54.63,11.74Zm-6.64-31.56,54.64-11.74,5,23.74-54.64,11.73Zm-2.71-32.4L182,36.09a4,4,0,0,1,.84-.09,3.94,3.94,0,0,1,2.14.64,4,4,0,0,1,1.76,2.58L190.88,59,136.24,70.72,132.09,51A4.07,4.07,0,0,1,135.18,46.15Zm81.65,155.7L170,211.91a4,4,0,0,1-3-.55,4,4,0,0,1-1.76-2.58L161.12,189l54.64-11.73L219.91,197A4.07,4.07,0,0,1,216.83,201.85Z"),
  caret: svg("M210.83,98.83l-80,80a4,4,0,0,1-5.66,0l-80-80a4,4,0,0,1,5.66-5.66L128,170.34l77.17-77.17a4,4,0,1,1,5.66,5.66Z"),
  caretLeft: svg("M162.83,205.17a4,4,0,0,1-5.66,5.66l-80-80a4,4,0,0,1,0-5.66l80-80a4,4,0,1,1,5.66,5.66L85.66,128Z"),
  caretRight: svg("M93.17,205.17a4,4,0,0,0,5.66,5.66l80-80a4,4,0,0,0,0-5.66l-80-80a4,4,0,1,0-5.66,5.66L170.34,128Z"),
  close: svg("M202.83,197.17a4,4,0,0,1-5.66,5.66L128,133.66,58.83,202.83a4,4,0,0,1-5.66-5.66L122.34,128,53.17,58.83a4,4,0,0,1,5.66-5.66L128,122.34l69.17-69.17a4,4,0,1,1,5.66,5.66L133.66,128Z"),
  grid: svg("M104,44H56A12,12,0,0,0,44,56v48a12,12,0,0,0,12,12h48a12,12,0,0,0,12-12V56A12,12,0,0,0,104,44Zm4,60a4,4,0,0,1-4,4H56a4,4,0,0,1-4-4V56a4,4,0,0,1,4-4h48a4,4,0,0,1,4,4Zm92-60H152a12,12,0,0,0-12,12v48a12,12,0,0,0,12,12h48a12,12,0,0,0,12-12V56A12,12,0,0,0,200,44Zm4,60a4,4,0,0,1-4,4H152a4,4,0,0,1-4-4V56a4,4,0,0,1,4-4h48a4,4,0,0,1,4,4ZM104,140H56a12,12,0,0,0-12,12v48a12,12,0,0,0,12,12h48a12,12,0,0,0,12-12V152A12,12,0,0,0,104,140Zm4,60a4,4,0,0,1-4,4H56a4,4,0,0,1-4-4V152a4,4,0,0,1,4-4h48a4,4,0,0,1,4,4Zm92-60H152a12,12,0,0,0-12,12v48a12,12,0,0,0,12,12h48a12,12,0,0,0,12-12V152A12,12,0,0,0,200,140Zm4,60a4,4,0,0,1-4,4H152a4,4,0,0,1-4-4V152a4,4,0,0,1,4-4h48a4,4,0,0,1,4,4Z"),
  home: svg("M216.49,111.51l-80-80a12,12,0,0,0-17,0l-80,80A12,12,0,0,0,36,120v96a4,4,0,0,0,4,4h64a4,4,0,0,0,4-4V156h40v60a4,4,0,0,0,4,4h64a4,4,0,0,0,4-4V120A12,12,0,0,0,216.49,111.51ZM212,212H156V152a4,4,0,0,0-4-4H104a4,4,0,0,0-4,4v60H44V120a4,4,0,0,1,1.17-2.83l80-80a4,4,0,0,1,5.66,0l80,80A4,4,0,0,1,212,120Z"),
  info: svg("M140,176a4,4,0,0,1-4,4,12,12,0,0,1-12-12V128a4,4,0,0,0-4-4,4,4,0,0,1,0-8,12,12,0,0,1,12,12v40a4,4,0,0,0,4,4A4,4,0,0,1,140,176ZM124,92a8,8,0,1,0-8-8A8,8,0,0,0,124,92Zm104,36A100,100,0,1,1,128,28,100.11,100.11,0,0,1,228,128Zm-8,0a92,92,0,1,0-92,92A92.1,92.1,0,0,0,220,128Z"),
  logo: svg("M100,104a4,4,0,0,1,4-4h64a4,4,0,0,1,0,8H104A4,4,0,0,1,100,104Zm4,36h64a4,4,0,0,0,0-8H104a4,4,0,0,0,0,8Zm124,52a28,28,0,0,1-28,28H88a28,28,0,0,1-28-28V64a20,20,0,0,0-40,0c0,7.78,6.34,12.75,6.4,12.8a4,4,0,1,1-4.8,6.4C21.21,82.91,12,75.86,12,64A28,28,0,0,1,40,36H176a28,28,0,0,1,28,28V172h12a4,4,0,0,1,2.4.8C218.79,173.09,228,180.14,228,192Zm-120,0c0-7.78-6.34-12.75-6.4-12.8A4,4,0,0,1,104,172h92V64a20,20,0,0,0-20-20H59.57A27.9,27.9,0,0,1,68,64V192a20,20,0,0,0,40,0Zm112,0c0-6-3.74-10.3-5.5-12H112.61A23.31,23.31,0,0,1,116,192a27.94,27.94,0,0,1-8.42,20H200A20,20,0,0,0,220,192Z"),
  menu: svg("M220,128a4,4,0,0,1-4,4H40a4,4,0,0,1,0-8H216A4,4,0,0,1,220,128ZM40,68H216a4,4,0,0,0,0-8H40a4,4,0,0,0,0,8ZM216,188H40a4,4,0,0,0,0,8H216a4,4,0,0,0,0-8Z"),
  pin: svg("M232.49,84.2,171.8,23.51a12,12,0,0,0-17,0L99.45,79.07c-8.08-3-32.79-9.45-59,11.67a12,12,0,0,0-1,17.84l51.13,51.13L45.17,205.17a4,4,0,0,0,5.66,5.66l45.46-45.47,51.12,51.12A12,12,0,0,0,155.9,220c.28,0,.57,0,.85,0a12,12,0,0,0,8.73-4.74c19.83-26.36,16.51-47.18,11.71-58.57l55.3-55.49A12,12,0,0,0,232.49,84.2Zm-5.66,11.31h0L169.56,153a4,4,0,0,0-.75,4.61c10.43,20.85-1.62,42-9.73,52.83a4,4,0,0,1-6,.4L45.17,102.93a4,4,0,0,1,.33-6C58.44,86.53,70.86,83.74,80.44,83.74A43.9,43.9,0,0,1,98.6,87.38a4,4,0,0,0,4.62-.75l57.27-57.46a4,4,0,0,1,5.66,0l60.68,60.69A4,4,0,0,1,226.83,95.51Z"),
  question: svg("M136,180a8,8,0,1,1-8-8A8,8,0,0,1,136,180ZM128,76c-19.85,0-36,14.36-36,32v4a4,4,0,0,0,8,0v-4c0-13.23,12.56-24,28-24s28,10.77,28,24-12.56,24-28,24a4,4,0,0,0-4,4v8a4,4,0,0,0,8,0v-4.2c18-1.77,32-15.36,32-31.8C164,90.36,147.85,76,128,76Zm100,52A100,100,0,1,1,128,28,100.11,100.11,0,0,1,228,128Zm-8,0a92,92,0,1,0-92,92A92.1,92.1,0,0,0,220,128Z"),
};

// How another printing compares with the text above, as a collation's
// derived status: a ring with a check, a dash or a cross, coloured by the
// stylesheet.
type Match = "exact" | "spelling" | "wording";
const MATCH: Readonly<Record<Match, { readonly label: string; readonly path: string }>> = {
  exact: { label: "مطابق", path: "M86 132l28 28 56-56" },
  spelling: { label: "يختلف في التشكيل والإملاء والترقيم", path: "M88 128h80" },
  wording: { label: "يختلف في الألفاظ", path: "M100 100l56 56M156 100l-56 56" },
};
// The same, counting a printing's hadith on its own page.
const COMPARED: Readonly<Record<Match, string>> = {
  exact: "تطابق النص المعروض",
  spelling: "تختلف في التشكيل والإملاء والترقيم",
  wording: "تختلف في الألفاظ",
};
const ring = (match: Match) =>
  `<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false" data-match="${match}"><circle cx="128" cy="128" r="96"/><path d="${MATCH[match].path}"/></svg>`;
const matchOf = (collation: CollationRecord): Match =>
  collation.differences.length === 0
    ? "exact"
    : collation.differences.some((difference) => difference.kind === "wording") ? "wording" : "spelling";

// A narration longer than this many base characters (combining marks are not
// counted) opens with «المزيد»: about four lines at the widest layout.
export const FOLD_BASE_CHARACTERS = 400;

// A preview card shows two lines of the saved text, the second fading out.
// It quotes whole words up to this many base characters, enough to fill both
// lines at the widest layout; the full text is on the hadith's own page.
export const PREVIEW_BASE_CHARACTERS = 240;

// A hadith's title quotes whole words up to this many base characters, then
// «... - أرشيف الحديث»: what a search result's title shows on a computer
// (about 600px of 20px Arial, measured on al-Nawawi's Forty).
export const TITLE_BASE_CHARACTERS = 50;

// Long lists are split into pages of this many hadith.
export const PAGE_SIZE = 20;

// The home page shows a few categories and books; «المزيد» leads to all.
const HOME_TOPICS = 8;
const HOME_BOOKS = 4;
// A cell whose printing matches the text: «=» on screen, a word for screen
// readers, which would otherwise say "equals".
const SAME = `<span aria-hidden="true">=</span><span>مطابق</span>`;

/** One generated text file, by its forward-slash path inside the output directory. */
export interface PageFile {
  readonly path: string;
  readonly text: string;
}

export interface RenderOptions {
  /** A short content hash per versioned asset path, appended as `?v=`. */
  readonly assetVersions: Readonly<Record<string, string>>;
  readonly pageSize: number;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "\"": "&quot;", "&": "&amp;", "'": "&#39;", "<": "&lt;", ">": "&gt;" })[character] as string
  );
}

/** Arabic-Indic digits, for display only. */
export function arabicDigits(value: number): string {
  return String(value).replace(/[0-9]/g, (digit) => String.fromCharCode(0x0660 + Number(digit)));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const SPACE = /\s/u;
const BARE = /^[\s\p{P}]*$/u;

interface ComparisonRow {
  /** Per collation, its own text for the stretch with its differences marked, or "=". */
  readonly cells: readonly string[];
  readonly text: string;
  readonly wording: boolean;
}

/**
 * The table of differences under a hadith: one row per stretch of the raw
 * text where any printing differs, widened to the words it touches, or to
 * the word on each side where it touches none, so its place shows.
 * Overlapping stretches share a row. Rows follow the raw text; offsets
 * count code points.
 */
export function comparisonRows(raw: string, collations: readonly CollationRecord[]): readonly ComparisonRow[] {
  const characters = [...raw];
  const html = (start: number, end: number) =>
    escapeHtml(characters.slice(start, end).join("")).replaceAll("\n", "<br>");
  const space = (index: number) => SPACE.test(characters[index] as string);
  const stretches = collations.flatMap((collation, column) => collation.differences.map((difference) => {
    const { span_end: last, span_start: first } = collation;
    let { end, start } = difference;
    const words = () => {
      while (start > first && !space(start - 1)) start -= 1;
      while (end < last && !space(end)) end += 1;
    };
    words();
    if (BARE.test(characters.slice(start, end).join(""))) {
      while (start > first && space(start - 1)) start -= 1;
      while (end < last && space(end)) end += 1;
      words();
    }
    return { column, difference, end, start };
  })).sort((left, right) => left.start - right.start || left.end - right.end);
  const groups: { end: number; members: typeof stretches; start: number }[] = [];
  for (const stretch of stretches) {
    const last = groups.at(-1);
    if (last !== undefined && stretch.start < last.end) {
      last.end = Math.max(last.end, stretch.end);
      last.members.push(stretch);
    } else {
      groups.push({ end: stretch.end, members: [stretch], start: stretch.start });
    }
  }
  return groups.map((group) => ({
    cells: collations.map((_, column) => {
      const differences = group.members
        .filter((member) => member.column === column)
        .map((member) => member.difference)
        .sort((left, right) => left.start - right.start || left.end - right.end);
      if (differences.length === 0) {
        return "=";
      }
      let at = group.start;
      let cell = "";
      for (const difference of differences) {
        cell += `${html(at, difference.start)}<mark data-match="${difference.kind}">${
          escapeHtml(difference.reading).replaceAll("\n", "<br>")
        }</mark>`;
        at = difference.end;
      }
      return cell + html(at, group.end);
    }),
    text: html(group.start, group.end),
    wording: group.members.some((member) => member.difference.kind === "wording"),
  }));
}

// Every page lives at a route relative to the site's address, ending in a
// slash; its file is the route's index.html. Section identifiers start with
// a letter, so a page number after a route never meets one.
const segment = (value: string | number) => encodeURIComponent(String(value));
export const ROUTE = {
  about: "about/",
  books: "b/",
  categories: "c/",
  hadith: (id: number) => `h/${segment(id)}/`,
  home: "",
  license: "license/",
  printing: (witnessId: string) => `p/${segment(witnessId)}/`,
  privacy: "privacy/",
  repository: "repository/",
  section: (sourceId: string, sectionId: string) => `b/${segment(sourceId)}/${segment(sectionId)}/`,
  source: (sourceId: string) => `b/${segment(sourceId)}/`,
  topic: (id: number) => `c/${segment(id)}/`,
};
const pageRoute = (route: string, page: number) => page === 1 ? route : `${route}${page}/`;

type ProphetWords = readonly NonNullable<OccurrenceRecord["prophet_words"]>[number][];

// A stretch of raw text that begins at code point `from`, escaped, with the
// Prophet's words, where the printing marks them, set apart.
function marked(text: string, from: number, words: ProphetWords): string {
  const points = [...text];
  let html = "";
  let at = 0;
  for (const { end, start } of words) {
    const first = Math.max(start - from, at);
    const last = Math.min(end - from, points.length);
    if (first >= last) continue;
    html += `${escapeHtml(points.slice(at, first).join(""))}<span class="prophet">${escapeHtml(points.slice(first, last).join(""))}</span>`;
    at = last;
  }
  return html + escapeHtml(points.slice(at).join(""));
}

// Every LF in preserved text separates paragraphs: <p>s, or the <span>s of
// a heading. `from` is where the text begins in its raw text.
function lines(text: string, from: number, words: ProphetWords, open: string, close: string): string[] {
  let at = from;
  return text.split("\n").map((line) => {
    const html = `${open}${marked(line, at, words)}${close}`;
    at += [...line].length + 1;
    return html;
  });
}

const paragraphs = (text: string, indent: string, from = 0, words: ProphetWords = []) =>
  lines(text, from, words, `${indent}<p>`, "</p>").join("\n");

const baseLength = (text: string) => [...text].filter((character) => !/\p{M}/u.test(character)).length;

// The first whole words of a text up to `limit` base characters, and whether
// they are all of it. Line breaks become spaces; the first word is kept even
// when it is longer.
function excerpt(text: string, limit: number): { readonly text: string; readonly whole: boolean } {
  const words = text.split(/\s+/).filter((word) => word !== "");
  let kept = 1;
  let length = baseLength(words[0] ?? "");
  while (kept < words.length && length + 1 + baseLength(words[kept] as string) <= limit) {
    length += 1 + baseLength(words[kept] as string);
    kept += 1;
  }
  return { text: words.slice(0, kept).join(" "), whole: kept >= words.length };
}

const preview = (text: string) => excerpt(text, PREVIEW_BASE_CHARACTERS).text;

// A hadith's title starts at the Prophet's first marked words, else at the
// text's start, so titles differ where narrator chains repeat. Quotation
// marks are left out, and a cut ends in «...».
function hadithTitle(text: string, from: number, words: ProphetWords): string {
  const characters = [...text];
  const first = words.find((range) => range.end > from && range.start < from + characters.length);
  const start = first === undefined ? 0 : Math.max(first.start - from, 0);
  const cut = excerpt(characters.slice(start).join("").replace(/[«»]/g, ""), TITLE_BASE_CHARACTERS);
  return cut.whole ? cut.text : `${cut.text.replace(/[\p{P}\s]+$/u, "")}...`;
}

// An ISBN in Arabic-Indic digits. An ISBN-10 whose check digit is X is
// shown as its ISBN-13, which has no letter.
export function isbnDigits(isbn: string): string {
  let shown = isbn;
  if (isbn.endsWith("X")) {
    const twelve = `978${isbn.slice(0, 9)}`;
    const sum = [...twelve].reduce((total, digit, at) => total + Number(digit) * (at % 2 === 0 ? 1 : 3), 0);
    shown = `${twelve}${(10 - sum % 10) % 10}`;
  }
  return shown.replace(/[0-9]/g, (digit) => String.fromCharCode(0x0660 + Number(digit)));
}

// Labelled values under a heading, such as a count or a book's author.
function facts(items: readonly (readonly [string, string])[], indent = "    "): string {
  return `${indent}<dl>\n${items.map(([label, value]) =>
    `${indent}  <div><dt>${label}</dt><dd>${value}</dd></div>`
  ).join("\n")}\n${indent}</dl>`;
}

// A page's description for search results: its heading, then what the page
// shows under it, as plain text.
function summary(heading: string, items: readonly string[]): string {
  return items.length === 0 ? heading : `${heading}: ${items.join("، ")}`;
}

const asText = ([label, value]: readonly [string, string]) => `${label} ${value}`;

// A written page's description: its first paragraph, which each one has.
const lead = (main: string) => (/<p>([^<]*)<\/p>/.exec(main) as RegExpExecArray)[1] as string;

// A printing's details: its title as printed, edition, year, ISBN, and the
// SHA-256 of the file it was taken from, left to right.
function printingFacts(witness: SourceWitnessRecord): (readonly [string, string])[] {
  const { edition_statement: edition, isbn, publication_year: year } = witness;
  return [
    ["العنوان", escapeHtml(witness.title_as_printed)],
    ...edition === undefined ? [] : [["الطبعة", escapeHtml(edition)] as const],
    ...year === undefined ? [] : [["سنة الطبع", arabicDigits(year)] as const],
    ...isbn === undefined ? [] : [["ردمك", isbnDigits(isbn)] as const],
    ["بصمة الملف", `<code dir="ltr">${escapeHtml(witness.file_sha256)}</code>`],
  ];
}

/**
 * The pager's entries: the first page, the last, and three around the
 * current one; a gap of one page shows that page, a longer gap `undefined`
 * (shown as «...»).
 */
export function pageNumbers(current: number, last: number): readonly (number | undefined)[] {
  const start = Math.max(1, Math.min(current - 1, last - 2));
  const shown = [...new Set([1, start, start + 1, start + 2, last])]
    .filter((page) => page <= last)
    .sort((left, right) => left - right);
  const entries: (number | undefined)[] = [];
  let previous = 0;
  for (const page of shown) {
    if (page - previous === 2) {
      entries.push(page - 1);
    } else if (page - previous > 2) {
      entries.push(undefined);
    }
    entries.push(page);
    previous = page;
  }
  return entries;
}

type Current = "about" | "books" | "categories" | "home" | "license" | "privacy" | "repository" | undefined;

interface PageContent {
  readonly title: string;
  readonly main: string;
  /** The page's own route, for its canonical address; the 404 page has none. */
  readonly route?: string;
  readonly current?: Current;
  readonly description?: string;
  /** What a shared link shows under its title, if not the description. */
  readonly share?: string;
}

interface Index {
  readonly collations: ReadonlyMap<number, readonly CollationRecord[]>;
  readonly hadithByMember: ReadonlyMap<number, HadithRecord>;
  readonly occurrence: ReadonlyMap<number, OccurrenceRecord>;
  readonly source: ReadonlyMap<string, SourceRecord>;
  readonly witness: ReadonlyMap<string, SourceWitnessRecord>;
}

function buildIndex(core: SiteInputs["core"]): Index {
  const hadithByMember = new Map<number, HadithRecord>();
  for (const record of core.hadith) {
    for (const member of record.member_occurrence_ids) {
      hadithByMember.set(member, record);
    }
  }
  const collations = new Map<number, CollationRecord[]>();
  for (const record of core.collations) {
    collations.set(record.occurrence_id, [...collations.get(record.occurrence_id) ?? [], record]);
  }
  return {
    collations,
    hadithByMember,
    occurrence: new Map(core.occurrences.map((record) => [record.occurrence_id, record])),
    source: new Map(core.sources.map((record) => [record.source_id, record])),
    witness: new Map(core.witnesses.map((record) => [record.witness_id, record])),
  };
}

// Witnesses by priority, highest first, then identifier; narrations and
// printings follow their witness, then printed order.
function compareWitnesses(index: Index) {
  return (left: string, right: string): number =>
    (index.witness.get(right) as SourceWitnessRecord).priority_score -
      (index.witness.get(left) as SourceWitnessRecord).priority_score ||
    compareText(left, right);
}

function compareOccurrences(index: Index) {
  const byWitness = compareWitnesses(index);
  return (left: OccurrenceRecord, right: OccurrenceRecord): number =>
    byWitness(left.witness_id, right.witness_id) || left.ordinal - right.ordinal;
}

const ABOUT = `    <h1>${ICON.info}حول أرشيف الحديث</h1>
    <div>
      <p>حفظ الله سنة نبيه ﷺ، وسخّر لها عبر القرون علماء اعتنوا بروايتها وجمعها وتدوينها، وبذلوا في دراستها وتمحيصها جهودًا عظيمة.</p>
      <p>واليوم تنتشر الأحاديث عبر المواقع والتطبيقات، لكن الوصول إلى مصادرها والتثبت من ألفاظها قد يكون صعبًا. ومن هنا نشأ أرشيف الحديث لخدمة السنة النبوية بما تتيحه الوسائل الحديثة.</p>
      <p>يجمع الأرشيف الأحاديث من كتب الحديث المشهورة مثل صحيح البخاري ومسلم، ويحفظ نصوصها كما طُبعت، مع ذكر الكتاب ودار النشر والطبعة ورقم الصفحة، حتى يسهل على القارئ الرجوع إلى المصدر والتثبت من النص.</p>
      <p>أرشيف الحديث مشروع مفتوح المصدر، تُتاح شيفراته وبياناته للجميع، ويمكن الاطلاع عليها والتحقق منها وتنزيلها وإعادة استخدامها كاملة من خلال المستودع.</p>
      <p>نرجو أن يكون الأرشيف حلقة وصل بين ما يقرأه الناس من أحاديث على الإنترنت ومصادرها في كتب السنة. نسأل الله أن يتقبله منا، وأن ينفع به، وأن يجعله خالصًا لوجهه الكريم.</p>
    </div>
    <h2>المنهجية</h2>
    <div>
      <p>ننقل الأحاديث كاملة دون تعديل، ونربط بينها وننظمها، حتى أقسامها مأخوذة من الكتب نفسها.</p>
    </div>`;

// The licence page, which is also the copyright page: a summary, the rights
// of others, and how to reach us, then the Arabic text of the repository's
// LICENSE, word for word, below its title.
const LICENSE = `    <h1>${ICON.info}الرخصة</h1>
    <div>
      <p>يجوز نسخ العمل وتعديله ونشره وتوزيعه وبيعه دون إذن.</p>
      <p>بشرط إرفاق الرخصة، وألا يُستخدم فيما لا يرضي الله تعالى.</p>
      <p>دون ضمان أو مسؤولية.</p>
      <p>ننقل نصوص الأحاديث كما طُبعت، ونذكر مصدر كل نص، وتبقى حقوق الطبعات لناشريها.</p>
      <p>الخط من مجمع الملك فهد لطباعة المصحف الشريف، والأيقونات من فوسفور، ولكل منهما رخصته.</p>
      <p>لأي ملاحظة راسلنا على <a href="mailto:admin@haditharchive.com" dir="ltr">admin@haditharchive.com</a></p>
    </div>
    <h2>نص الرخصة</h2>
    <div>
      <p>حقوق النشر © ٢٠٢٦، المساهمون في أرشيف الحديث.</p>
      <p>هذا العمل متاح للجميع مجانًا، ويجوز نسخه وتعديله ونشره وتوزيعه وبيعه دون الحاجة إلى إذن مسبق، على ألا يُستخدم فيما لا يرضي الله تعالى؛ فنحن لا نأذن بذلك، ونتبرأ إلى الله من ذلك.</p>
      <p>تسري هذه الرخصة على ما أنشأه المساهمون في أرشيف الحديث من شيفرات ووثائق وبيانات، بما في ذلك اختيار البيانات وتنظيمها ومعرّفاتها.</p>
      <p>وتبقى حقوق المواد التي استعنا بها من أعمال الآخرين، كالخطوط والأيقونات، لأصحابها، وتخضع كل مادة لرخصتها الخاصة، المبينة في ملف CREDITS.md.</p>
      <p>يجب إرفاق هذه الرخصة عند نسخ العمل أو أي جزء جوهري منه.</p>
      <p>يُقدَّم هذا العمل بحالته الراهنة، دون أي ضمان من أي نوع، ولا يتحمل المساهمون فيه مسؤولية أي أضرار أو مطالبات أو تبعات تنشأ عنه أو عن استخدامه.</p>
    </div>`;

const PRIVACY = `    <h1>${ICON.info}الخصوصية</h1>
    <div>
      <p>لا يجمع الموقع بيانات عن زواره: لا حسابات ولا ملفات تعريف ارتباط ولا أدوات تحليل ولا إعلانات.</p>
      <p>الموقع مستضاف على صفحات المستودع، التي قد تحفظ عناوين الزوار للأمان.</p>
      <p>لأي سؤال راسلنا على <a href="mailto:admin@haditharchive.com" dir="ltr">admin@haditharchive.com</a></p>
    </div>`;

/** Renders every page; the order of the result is the order of `path`. */
export function renderSite(inputs: SiteInputs, options: RenderOptions): readonly PageFile[] {
  const { core, site, topics } = inputs;
  // Links are root-absolute under the site's path, so the font preload and
  // the 404 page work at any depth; canonical addresses and the sitemap need
  // whole addresses.
  const base = new URL(site.url).pathname.replace(/\/$/, "");
  const at = (route: string) => `${base}/${route}`;
  const absolute = (route: string) => `${site.url}/${route}`;
  const asset = (path: string) => `${at(path)}?v=${options.assetVersions[path] as string}`;
  const name = escapeHtml(site.name);
  const sourceUrl = escapeHtml(site.source_url);

  // Prerender a page when its link is hovered. The security policy allows
  // the site's own files, and this one inline script by its hash.
  const speculation = `{"prerender":[{"where":{"href_matches":"${at(ROUTE.home)}*"},"eagerness":"moderate"}]}`;
  const policy = `default-src 'self'; script-src 'self' 'sha256-${
    createHash("sha256").update(speculation).digest("base64")
  }'; object-src 'none'; base-uri 'none'; form-action 'self'`;

  const layout = (page: PageContent): string => {
    const here = (current: Current) => page.current === current ? " aria-current=\"page\"" : "";
    const description = page.description === undefined
      ? ""
      : `\n  <meta name="description" content="${escapeHtml(page.description)}">`;
    // Search engines index the site only when it says so, and never the 404 page.
    const robots = site.indexable && page.route !== undefined ? "" : "\n  <meta name=\"robots\" content=\"noindex\">";
    const canonical = page.route === undefined
      ? ""
      : `\n  <link rel="canonical" href="${escapeHtml(absolute(page.route))}">`;
    // A shared link: its title and description in WhatsApp, Telegram and X,
    // and the site's image in X's card alone, which otherwise shows an
    // empty icon (WhatsApp and Telegram read only og:image).
    const shared = page.share ?? page.description;
    const sharing = page.route === undefined ? "" : `
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${name}">
  <meta property="og:title" content="${escapeHtml(page.title)}">${shared === undefined ? "" : `
  <meta property="og:description" content="${escapeHtml(shared)}">`}
  <meta property="og:url" content="${escapeHtml(absolute(page.route))}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:image" content="${escapeHtml(absolute("share.png"))}">
  <meta name="twitter:image:alt" content="${name}">`;
    return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${policy}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="text-scale" content="scale">${robots}${description}
  <title>${escapeHtml(page.title)}</title>${canonical}${sharing}
  <link rel="preload" href="${at("font/UthmanTN_v2-0.woff2")}" as="font" type="font/woff2" crossorigin>
  <link rel="icon" href="${at("favicon.ico")}" sizes="32x32">
  <link rel="icon" href="${at("favicon.svg")}" type="image/svg+xml">
  <link rel="stylesheet" href="${asset("style.css")}">
  <script type="speculationrules">${speculation}</script>
</head>
<body>
  <a href="#main">تخطَّ إلى المحتوى</a>
  <header>
    <a href="${at(ROUTE.home)}"${here("home")}>${ICON.logo}${name}</a>
    <button type="button" popovertarget="menu" aria-label="القائمة">
      ${ICON.menu}
    </button>
    <nav id="menu" popover>
      <button type="button" popovertarget="menu" popovertargetaction="hide" aria-label="إغلاق القائمة" autofocus>
        ${ICON.close}
      </button>
      <ul role="list">
        <li><a href="${at(ROUTE.home)}"${here("home")}>${ICON.home}الرئيسية</a></li>
        <li><a href="${at(ROUTE.categories)}"${here("categories")}>${ICON.grid}الأقسام</a></li>
        <li><a href="${at(ROUTE.books)}"${here("books")}>${ICON.books}الكتب</a></li>
      </ul>
    </nav>
  </header>
  <main id="main">
${page.main}
  </main>
  <footer>
    <ul role="list">
      <li><a href="${at(ROUTE.about)}"${here("about")}>حول</a></li>
      <li><a href="${at(ROUTE.license)}"${here("license")}>الرخصة</a></li>
      <li><a href="${at(ROUTE.privacy)}"${here("privacy")}>الخصوصية</a></li>
      <li><a href="${at(ROUTE.repository)}"${here("repository")}>المستودع</a></li>
    </ul>
  </footer>
  <script src="${asset("script.js")}"></script>
</body>
</html>
`;
  };

  const pages: PageFile[] = [];
  const add = (path: string, page: PageContent) => pages.push({ path, text: layout(page) });
  const addRoute = (route: string, page: PageContent) => add(`${route}index.html`, { ...page, route });
  const titled = (...parts: string[]) => [...parts, site.name].join(" - ");

  const index = buildIndex(core);
  const byOccurrence = compareOccurrences(index);
  const sources = [...core.sources].sort((left, right) => compareText(left.source_id, right.source_id));
  const hadith = [...core.hadith].sort((left, right) => left.hadith_id - right.hadith_id);
  const hadithById = new Map(hadith.map((record) => [record.hadith_id, record]));

  const topicTiles = (items: readonly Topic[]) => `      <ul role="list">
${items.map((topic) =>
  `        <li><a href="${at(ROUTE.topic(topic.topic_id))}">${escapeHtml(topic.title)}</a></li>`
).join("\n")}
      </ul>`;
  const bookCards = (items: readonly SourceRecord[]) => `      <ul role="list">
${items.map((source) =>
  `        <li><a href="${at(ROUTE.source(source.source_id))}">${escapeHtml(source.title)} <span>${escapeHtml(source.author)}</span></a></li>`
).join("\n")}
      </ul>`;
  const bookLink = (source: SourceRecord) =>
    `${ICON.pin}<cite><a href="${at(ROUTE.source(source.source_id))}">${escapeHtml(source.title)}</a></cite>`;

  const pager = (route: string, current: number, last: number): string => {
    const link = (page: number, attributes: string, content: string) =>
      `        <li><a href="${at(pageRoute(route, page))}"${attributes}>${content}</a></li>`;
    const items = [
      ...current > 1 ? [link(current - 1, " aria-label=\"الصفحة السابقة\"", ICON.caretRight)] : [],
      ...pageNumbers(current, last).map((page) => page === undefined
        ? "        <li aria-hidden=\"true\">...</li>"
        : link(page, page === current ? " aria-current=\"page\"" : "", arabicDigits(page))),
      ...current < last ? [link(current + 1, " aria-label=\"الصفحة التالية\"", ICON.caretLeft)] : [],
    ];
    return `    <nav aria-label="الصفحات">
      <ul role="list">
${items.join("\n")}
      </ul>
    </nav>`;
  };

  // A browse page: its heading and facts, then each hadith once as a card of
  // its opening words leading to its own page, split into numbered pages.
  // Anything listed before the hadith (a book's abwab and printings) shows
  // on the first, and the hadith then take a heading of their own.
  const addList = (
    route: string,
    title: readonly string[],
    current: Current,
    top: readonly string[],
    before: readonly string[],
    listed: readonly HadithRecord[],
    description: string,
  ) => {
    const last = Math.max(1, Math.ceil(listed.length / options.pageSize));
    for (let page = 1; page <= last; page += 1) {
      const cards = listed.slice((page - 1) * options.pageSize, page * options.pageSize);
      addRoute(pageRoute(route, page), {
        current: page === 1 ? current : undefined,
        main: [
          ...top,
          ...page === 1 ? before : [],
          ...page === 1 && before.length > 0 && cards.length > 0 ? [`    <h2>${ICON.logo}الأحاديث</h2>`] : [],
          ...cards.length === 0 ? [] : [`    <ol role="list">
${cards.map((record) =>
  `      <li><a href="${at(ROUTE.hadith(record.hadith_id))}"><span>${escapeHtml(preview(record.text))}</span>${ICON.arrow}</a></li>`
).join("\n")}
    </ol>`],
          ...last === 1 ? [] : [pager(route, page, last)],
        ].join("\n"),
        title: page === 1 ? titled(...title) : titled(title[0] as string, `الصفحة ${arabicDigits(page)}`, ...title.slice(1)),
        description: page === 1 ? description : `${description}، الصفحة ${arabicDigits(page)}`,
      });
    }
  };

  // The site launches without search. Its title is the site's name, hidden
  // on screen, and before any topic is reviewed it shows books only.
  addRoute(ROUTE.home, {
    current: "home",
    main: [
      `    <h1>${escapeHtml(site.name)}</h1>`,
      ...topics.length === 0 ? [] : [`    <section aria-labelledby="aqsam">
      <h2 id="aqsam"><a href="${at(ROUTE.categories)}">${ICON.grid}الأقسام</a></h2>
      <a href="${at(ROUTE.categories)}">المزيد${ICON.caretLeft}</a>
${topicTiles(topics.slice(0, HOME_TOPICS))}
    </section>`],
      `    <section aria-labelledby="kutub">
      <h2 id="kutub"><a href="${at(ROUTE.books)}">${ICON.books}الكتب</a></h2>
      <a href="${at(ROUTE.books)}">المزيد${ICON.caretLeft}</a>
${bookCards(sources.slice(0, HOME_BOOKS))}
    </section>`,
    ].join("\n"),
    title: site.name,
    description: [
      ...topics.length === 0 ? [] : [summary("الأقسام", topics.slice(0, HOME_TOPICS).map((topic) => topic.title))],
      summary("الكتب", sources.slice(0, HOME_BOOKS).map((source) => source.title)),
    ].join(". "),
  });

  // GitHub Pages answers every missing address with this page.
  add("404.html", {
    main: `    <h1>${ICON.question}الصفحة غير موجودة</h1>`,
    title: titled("الصفحة غير موجودة"),
  });

  addRoute(ROUTE.about, { current: "about", description: lead(ABOUT), main: ABOUT, title: `حول ${site.name}` });
  addRoute(ROUTE.license, { current: "license", description: lead(LICENSE), main: LICENSE, title: titled("الرخصة") });
  addRoute(ROUTE.privacy, { current: "privacy", description: lead(PRIVACY), main: PRIVACY, title: titled("الخصوصية") });
  // The repository page: what it holds and what anyone can do with it,
  // with its address in the facts under the title.
  const repository = `    <h1>${ICON.info}المستودع</h1>
${facts([["الرابط", `<a href="${sourceUrl}" rel="nofollow">فتح المستودع</a>`]])}
    <div>
      <p>المستودع يحفظ أرشيف الحديث كله: بياناته وشيفراته ووثائقه، ومنه يُبنى هذا الموقع.</p>
      <p>يمكن لأي أحد الاطلاع على بياناته وتنزيلها كاملة دون حساب.</p>
      <p>ويُسجَّل فيه كل تغيير بتاريخه ووقته، فيُعرف متى أضيف كل نص وما تغيّر فيه.</p>
      <p>ولكل تغيير بصمة رقمية موقَّعة، فلا يتغير شيء دون أن يظهر.</p>
      <p>وبذلك يبقى الأرشيف محفوظًا ويمكن التحقق منه.</p>
    </div>`;
  addRoute(ROUTE.repository, {
    current: "repository",
    description: lead(repository),
    main: repository,
    title: titled("المستودع"),
  });

  addRoute(ROUTE.categories, {
    current: "categories",
    main: `    <h1 id="aqsam">${ICON.grid}الأقسام</h1>
${facts([["عدد الأقسام", arabicDigits(topics.length)]])}
    <section aria-labelledby="aqsam">
${topicTiles(topics)}
    </section>`,
    title: titled("الأقسام"),
    description: summary("الأقسام", topics.map((topic) => topic.title)),
  });

  for (const topic of topics) {
    const count = ["عدد الأحاديث", arabicDigits(topic.hadith_ids.length)] as const;
    addList(ROUTE.topic(topic.topic_id), [topic.title], undefined, [
      `    <h1>${ICON.grid}${escapeHtml(topic.title)}</h1>`,
      facts([count]),
    ], [], topic.hadith_ids.map((id) => hadithById.get(id) as HadithRecord), summary(topic.title, [asText(count)]));
  }

  addRoute(ROUTE.books, {
    current: "books",
    main: `    <h1 id="kutub">${ICON.books}الكتب</h1>
${facts([["عدد الكتب", arabicDigits(sources.length)]])}
    <section aria-labelledby="kutub">
${bookCards(sources)}
    </section>`,
    title: titled("الكتب"),
    description: `الكتب: ${sources.map((source) => `${source.title}، ${source.author}`).join("؛ ")}`,
  });

  // Each hadith once, where the first of its occurrences comes.
  const hadithOf = (occurrences: readonly OccurrenceRecord[]) => [
    ...new Set(occurrences.flatMap((occurrence) => index.hadithByMember.get(occurrence.occurrence_id) ?? [])),
  ];
  const sectionList = (sourceId: string, sections: readonly SectionRecord[]) => sections.length === 0
    ? []
    : [`    <section aria-labelledby="abwab">
      <ul role="list">
${sections.map((section) =>
  `        <li><a href="${at(ROUTE.section(sourceId, section.section_id))}">${escapeHtml(section.title)}</a></li>`
).join("\n")}
      </ul>
    </section>`];
  const counted = (label: string, count: number) =>
    count === 0 ? [] : [[label, arabicDigits(count)] as const];
  const printingList = (witnesses: readonly SourceWitnessRecord[]) => witnesses.length === 0
    ? []
    : [`    <section aria-labelledby="tabaat">
      <h2 id="tabaat">${ICON.books}الطبعات</h2>
      <ul role="list">
${witnesses.map((witness) =>
  `        <li><a href="${at(ROUTE.printing(witness.witness_id))}">${escapeHtml(witness.publisher)}${
    witness.publication_year === undefined ? "" : ` <span>${arabicDigits(witness.publication_year)}</span>`
  }</a></li>`
).join("\n")}
      </ul>
    </section>`];
  const byWitness = compareWitnesses(index);

  for (const source of sources) {
    const sections = core.sections
      .filter((section) => section.source_id === source.source_id)
      .sort((left, right) => left.ordinal - right.ordinal);
    const childrenOf = (parent: string | undefined) =>
      sections.filter((section) => section.parent_section_id === parent);
    // The book and its sections are presented as one witness printed them:
    // the highest priority, ties settled on the witness identifier. Nothing
    // falls back to another witness where the presenting one has no record.
    const witnesses = core.witnesses
      .filter((witness) => witness.source_id === source.source_id)
      .sort((left, right) => byWitness(left.witness_id, right.witness_id));
    const presenting = witnesses[0];
    const occurrences = presenting === undefined
      ? []
      : core.occurrences
        .filter((occurrence) => occurrence.witness_id === presenting.witness_id)
        .sort(byOccurrence);
    const within = (sectionId: string | undefined): readonly OccurrenceRecord[] => [
      ...occurrences.filter((occurrence) => occurrence.section_id === sectionId),
      ...childrenOf(sectionId).flatMap((child) => within(child.section_id)),
    ];

    const topSections = childrenOf(undefined);
    const bookCounts = [
      ...counted("عدد الأبواب", topSections.length),
      ...counted("عدد الأحاديث", hadithOf(occurrences).length),
      ...counted("عدد الطبعات", witnesses.length),
    ];
    addList(ROUTE.source(source.source_id), [source.title], undefined, [
      `    <h1 id="abwab">${ICON.books}${escapeHtml(source.title)}</h1>`,
      facts([["المؤلف", escapeHtml(source.author)], ...bookCounts]),
    ], [...sectionList(source.source_id, topSections), ...printingList(witnesses)],
    hadithOf(occurrences.filter((occurrence) => occurrence.section_id === undefined)),
    summary(source.title, [`المؤلف ${source.author}`, ...bookCounts.map(asText)]));

    // Each printing's page: under its book, one card of what the printing
    // says of itself, then its text: the one shown here, or how many of its
    // hadith match that one.
    for (const witness of witnesses) {
      const compared = core.collations.filter((collation) => collation.witness_id === witness.witness_id);
      const text = witness === presenting
        ? [...counted("عدد الأحاديث", hadithOf(occurrences).length), ["النص", "المعروض في الموقع"] as const]
        : [
          ...counted("عدد الأحاديث", new Set(compared.flatMap((collation) =>
            index.hadithByMember.get(collation.occurrence_id) ?? []
          )).size),
          ...(["exact", "spelling", "wording"] as const).flatMap((match) =>
            counted(COMPARED[match], compared.filter((collation) => matchOf(collation) === match).length)
          ),
        ];
      addRoute(ROUTE.printing(witness.witness_id), {
        main: `    <h1>${ICON.books}طبعة ${escapeHtml(witness.publisher)}</h1>
${facts([["الكتاب", bookLink(source)], ["المؤلف", escapeHtml(source.author)]])}
    <div>
${facts([...printingFacts(witness), ...text], "      ")}
    </div>`,
        title: titled(`طبعة ${witness.publisher}`, source.title),
        description: summary(`طبعة ${witness.publisher}`, [
          `الكتاب ${source.title}`,
          `المؤلف ${source.author}`,
          ...witness.edition_statement === undefined ? [] : [witness.edition_statement],
          ...witness.publication_year === undefined ? [] : [`سنة الطبع ${arabicDigits(witness.publication_year)}`],
          ...witness.isbn === undefined ? [] : [`ردمك ${isbnDigits(witness.isbn)}`],
        ]),
      });
    }

    for (const section of sections) {
      const children = childrenOf(section.section_id);
      const sectionCounts = [
        ...counted("عدد الأبواب", children.length),
        ...counted("عدد الأحاديث", hadithOf(within(section.section_id)).length),
      ];
      addList(ROUTE.section(source.source_id, section.section_id), [section.title, source.title], undefined, [
        `    <h1${children.length === 0 ? "" : " id=\"abwab\""}>${ICON.bookmark}${escapeHtml(section.title)}</h1>`,
        facts([["الكتاب", bookLink(source)], ...sectionCounts]),
      ], sectionList(source.source_id, children),
      hadithOf(occurrences.filter((occurrence) => occurrence.section_id === section.section_id)),
      summary(section.title, [`الكتاب ${source.title}`, ...sectionCounts.map(asText)]));
    }
  }

  // A page range uses the font's own hyphen; the Naskh has no en dash.
  const pageSpan = ({ page_end: end, page_start: start }: OccurrenceRecord["location"]) =>
    start === end ? arabicDigits(start) : `${arabicDigits(start)}-${arabicDigits(end)}`;

  // Two lines under a text: the book, with the hadith's number, and the
  // printing, by its publisher, with the volume and page.
  const citation = (occurrence: OccurrenceRecord, indent: string) => {
    const witness = index.witness.get(occurrence.witness_id) as SourceWitnessRecord;
    const source = index.source.get(witness.source_id) as SourceRecord;
    const { hadith_number: number, volume } = occurrence.location;
    return `${facts([
      ["الكتاب", `${ICON.pin}كتاب <cite><a href="${at(ROUTE.source(source.source_id))}">${escapeHtml(source.title)}</a></cite>`],
      ...number === undefined ? [] : [["رقم الحديث", arabicDigits(number)] as const],
    ], indent)}
${facts([
      ["طبعة", `<a href="${at(ROUTE.printing(witness.witness_id))}">${escapeHtml(witness.publisher)}</a>`],
      ...volume === undefined ? [] : [["الجزء", arabicDigits(volume)] as const],
      ["الصفحة", pageSpan(occurrence.location)],
    ], indent)}`;
  };

  // One narration: the printed text, folded when long, then its citation.
  const narration = (occurrence: OccurrenceRecord, indent: string) => {
    const fold = baseLength(occurrence.raw_text) > FOLD_BASE_CHARACTERS
      ? `\n${indent}    <details>\n${indent}      <summary><span>المزيد</span><span>أقل</span>${ICON.caret}</summary>\n${indent}    </details>`
      : "";
    return `${indent}<li id="occurrence-${occurrence.occurrence_id}">
${indent}  <div>
${indent}    <blockquote>
${paragraphs(occurrence.raw_text, `${indent}      `, 0, occurrence.prophet_words)}
${indent}    </blockquote>${fold}
${indent}  </div>
${citation(occurrence, `${indent}  `)}
${indent}</li>`;
  };

  // «المصدر»: the displayed narration's book and printing in full, in a card that
  // opens like «تفاصيل الطبعات» below it.
  const sourceDetails = (occurrence: OccurrenceRecord) => {
    const witness = index.witness.get(occurrence.witness_id) as SourceWitnessRecord;
    const book = index.source.get(witness.source_id) as SourceRecord;
    const { hadith_number: number, volume } = occurrence.location;
    return [`      <section aria-labelledby="masdar">
        <h2 id="masdar">${ICON.pin}المصدر</h2>
        <details>
          <summary><span>عرض المصدر</span><span>إخفاء المصدر</span>${ICON.caret}</summary>
          <div>
${facts([
  ["الكتاب", `<cite><a href="${at(ROUTE.source(book.source_id))}">${escapeHtml(book.title)}</a></cite>`],
  ["المؤلف", escapeHtml(book.author)],
  ...number === undefined ? [] : [["رقم الحديث", arabicDigits(number)] as const],
], "            ")}
${facts([
  ["طبعة", `<a href="${at(ROUTE.printing(witness.witness_id))}">${escapeHtml(witness.publisher)}</a>`],
  ...printingFacts(witness),
  ...volume === undefined ? [] : [["الجزء", arabicDigits(volume)] as const],
  ["الصفحة", pageSpan(occurrence.location)],
], "            ")}
          </div>
        </details>
      </section>`];
  };

  // «تفاصيل الطبعات»: the other printings of the displayed narration, each with
  // its year and how it compares with the text above, then the table of differences,
  // word differences first.
  const printings = (occurrence: OccurrenceRecord) => {
    const collations = [...index.collations.get(occurrence.occurrence_id) ?? []]
      .sort((left, right) => byWitness(left.witness_id, right.witness_id));
    if (collations.length === 0) {
      return [];
    }
    const publisher = (witnessId: string) =>
      escapeHtml((index.witness.get(witnessId) as SourceWitnessRecord).publisher);
    const printingLink = (witnessId: string) =>
      `<a href="${at(ROUTE.printing(witnessId))}">${publisher(witnessId)}</a>`;
    const items = collations.map((collation) => {
      const match = matchOf(collation);
      const { volume } = collation.location;
      const year = (index.witness.get(collation.witness_id) as SourceWitnessRecord).publication_year;
      return `              <li>
                <dl>
                  <div><dt>طبعة</dt><dd>${printingLink(collation.witness_id)}</dd></div>${
        year === undefined ? "" : `\n                  <div><dt>سنة الطبع</dt><dd>${arabicDigits(year)}</dd></div>`
      }${
        volume === undefined ? "" : `\n                  <div><dt>الجزء</dt><dd>${arabicDigits(volume)}</dd></div>`
      }
                  <div><dt>الصفحة</dt><dd>${pageSpan(collation.location)}</dd></div>
                  <div><dt>المقابلة بالنص أعلاه</dt><dd data-match="${match}">${ring(match)}${MATCH[match].label}</dd></div>
                </dl>
              </li>`;
    });
    const rows = comparisonRows(occurrence.raw_text, collations);
    const group = (wording: boolean, title: string) => {
      const listed = rows.filter((row) => row.wording === wording);
      return listed.length === 0 ? [] : [`              <tbody>
                <tr><th colspan="${collations.length + 1}" scope="rowgroup">${title}</th></tr>
${listed.map((row) =>
  `                <tr><th scope="row">${row.text}</th>${row.cells.map((cell) => `<td>${cell === "=" ? SAME : cell}</td>`).join("")}</tr>`
).join("\n")}
              </tbody>`];
    };
    const table = rows.length === 0 ? [] : [`            <table>
              <caption>مقارنة الفروقات</caption>
              <thead>
                <tr><th scope="col">${publisher(occurrence.witness_id)}</th>${collations.map((collation) =>
      `<th scope="col">${ring(matchOf(collation))}${publisher(collation.witness_id)}</th>`
    ).join("")}</tr>
              </thead>
${[...group(true, "الفروق في الألفاظ"), ...group(false, "الفروق في التشكيل والإملاء والترقيم")].join("\n")}
            </table>`];
    return [`      <section aria-labelledby="tafasil">
        <h2 id="tafasil">${ICON.books}تفاصيل الطبعات</h2>
        <details>
          <summary><span>عرض الطبعات</span><span>إخفاء الطبعات</span>${ICON.caret}</summary>
          <div>
${[`            <ol role="list">
${items.join("\n")}
            </ol>`, ...table].join("\n")}
          </div>
        </details>
      </section>`];
  };

  for (const record of hadith) {
    const display = index.occurrence.get(record.display_occurrence_id) as OccurrenceRecord;
    const others = record.member_occurrence_ids
      .filter((id) => id !== display.occurrence_id)
      .map((id) => index.occurrence.get(id) as OccurrenceRecord)
      .sort(byOccurrence);
    // The saved text supplies the heading, the description and, from the
    // Prophet's words, the title.
    // The card holds the displayed narration in full: the heading, then the
    // rest of the entry where the text opens it, else the whole narration.
    const plain = record.text.replaceAll("\n", " ");
    const raw = display.raw_text;
    const rest = raw === record.text
      ? ""
      : raw.startsWith(`${record.text}\n`) ? raw.slice(record.text.length + 1) : raw;
    const words = display.prophet_words ?? [];
    const textFrom = [...raw.slice(0, raw.indexOf(record.text))].length;
    const restFrom = rest === raw ? 0 : [...record.text].length + 1;
    // A shared hadith shows where its text is printed: the book, the
    // hadith's number, the printing, and the volume and page.
    const witness = index.witness.get(display.witness_id) as SourceWitnessRecord;
    const { hadith_number: number, volume } = display.location;
    const share = [
      (index.source.get(witness.source_id) as SourceRecord).title,
      ...number === undefined ? [] : [`الحديث ${arabicDigits(number)}`],
      `طبعة ${witness.publisher}`,
      ...volume === undefined ? [] : [`الجزء ${arabicDigits(volume)}`],
      `الصفحة ${pageSpan(display.location)}`,
    ].join("، ");
    addRoute(ROUTE.hadith(record.hadith_id), {
      description: plain,
      share,
      main: [
        "    <article>",
        "      <div>",
        `        <h1>${lines(record.text, textFrom, words, "<span>", "</span>").join("\n")}</h1>`,
        ...rest === "" ? [] : [paragraphs(rest, "        ", restFrom, words)],
        "      </div>",
        ...sourceDetails(display),
        ...printings(display),
        ...others.length === 0 ? [] : [`      <section aria-labelledby="masadir">
        <h2 id="masadir">${ICON.books}مصادر أخرى</h2>
        <ol role="list">
${others.map((occurrence) => narration(occurrence, "          ")).join("\n")}
        </ol>
      </section>`],
        "    </article>",
      ].join("\n"),
      title: titled(hadithTitle(record.text, textFrom, words)),
    });
  }

  // An indexable site lists every page but the 404 in its sitemap; at a
  // host's root, where crawlers look for it, robots.txt admits every
  // crawler and names the sitemap.
  if (site.indexable) {
    const routes = pages.map((file) => file.path)
      .filter((path) => path.endsWith("index.html"))
      .sort(compareText)
      .map((path) => path.slice(0, -"index.html".length));
    pages.push({
      path: "sitemap.xml",
      text: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map((route) => `  <url><loc>${escapeHtml(absolute(route))}</loc></url>`).join("\n")}
</urlset>
`,
    });
    if (base === "") {
      pages.push({ path: "robots.txt", text: `User-agent: *\nAllow: /\n\nSitemap: ${absolute("sitemap.xml")}\n` });
    }
  }

  return pages.sort((left, right) => compareText(left.path, right.path));
}
