import type {
  HadithRecord,
  OccurrenceRecord,
  SectionRecord,
  SourceRecord,
  SourceWitnessRecord,
} from "../../../packages/core-loader/src/index.ts";

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

// A narration longer than this many base characters (combining marks are not
// counted) opens with «المزيد»: about four lines at the widest layout.
export const FOLD_BASE_CHARACTERS = 400;

// A preview card shows two lines of the saved text, the second fading out.
// It quotes whole words up to this many base characters, enough to fill both
// lines at the widest layout; the full text is on the hadith's own page.
export const PREVIEW_BASE_CHARACTERS = 240;

// Long lists are split into pages of this many hadith.
export const PAGE_SIZE = 20;

// The home page shows a few categories and books; «المزيد» leads to all.
const HOME_TOPICS = 8;
const HOME_BOOKS = 4;

/** One generated file, by its forward-slash path inside the output directory. */
export interface PageFile {
  readonly path: string;
  readonly html: string;
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

// Every page lives at a route relative to the site's address, ending in a
// slash; its file is the route's index.html. Section identifiers start with
// a letter, so a page number after a route never meets one.
const segment = (value: string | number) => encodeURIComponent(String(value));
const ROUTE = {
  about: "about/",
  books: "b/",
  categories: "c/",
  hadith: (id: number) => `h/${segment(id)}/`,
  home: "",
  section: (sourceId: string, sectionId: string) => `b/${segment(sourceId)}/${segment(sectionId)}/`,
  source: (sourceId: string) => `b/${segment(sourceId)}/`,
  topic: (id: number) => `c/${segment(id)}/`,
};
const pageRoute = (route: string, page: number) => page === 1 ? route : `${route}${page}/`;

// Every LF in preserved text separates paragraphs.
const paragraphs = (text: string, indent: string) =>
  text.split("\n").map((part) => `${indent}<p>${escapeHtml(part)}</p>`).join("\n");

const baseLength = (text: string) => [...text].filter((character) => !/\p{M}/u.test(character)).length;

// Line breaks become spaces; the first word is kept even when it is longer.
function preview(text: string): string {
  const words = text.split(/\s+/).filter((word) => word !== "");
  let kept = 1;
  let length = baseLength(words[0] ?? "");
  while (kept < words.length && length + 1 + baseLength(words[kept] as string) <= PREVIEW_BASE_CHARACTERS) {
    length += 1 + baseLength(words[kept] as string);
    kept += 1;
  }
  return words.slice(0, kept).join(" ");
}

// Labelled values under a heading, such as a count or a book's author.
function facts(items: readonly (readonly [string, string])[], indent = "    "): string {
  return `${indent}<dl>\n${items.map(([label, value]) =>
    `${indent}  <div><dt>${label}</dt><dd>${value}</dd></div>`
  ).join("\n")}\n${indent}</dl>`;
}

// JSON inside a script element: "<" is escaped so no value can close it.
function structuredData(value: unknown): string {
  const json = JSON.stringify(value, null, 2).replace(/[<>&]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
  return `\n  <script type="application/ld+json">\n${json.split("\n").map((line) => `  ${line}`).join("\n")}\n  </script>`;
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

type Current = "about" | "books" | "categories" | "home" | undefined;

interface PageContent {
  readonly title: string;
  readonly main: string;
  readonly current?: Current;
  readonly description?: string;
  readonly head?: string | undefined;
}

interface Index {
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
  return {
    hadithByMember,
    occurrence: new Map(core.occurrences.map((record) => [record.occurrence_id, record])),
    source: new Map(core.sources.map((record) => [record.source_id, record])),
    witness: new Map(core.witnesses.map((record) => [record.witness_id, record])),
  };
}

// Narrations follow witness priority, highest first, then witness and
// printed order.
function compareOccurrences(index: Index) {
  return (left: OccurrenceRecord, right: OccurrenceRecord): number => {
    const leftWitness = index.witness.get(left.witness_id) as SourceWitnessRecord;
    const rightWitness = index.witness.get(right.witness_id) as SourceWitnessRecord;
    return rightWitness.priority_score - leftWitness.priority_score ||
      compareText(left.witness_id, right.witness_id) ||
      left.ordinal - right.ordinal;
  };
}

const ABOUT = `    <h1>${ICON.info}حول أرشيف الحديث</h1>
    <div>
      <p>حفظ الله سنة نبيه ﷺ، وسخّر لها عبر القرون علماء اعتنوا بروايتها وجمعها وتدوينها، وبذلوا في دراستها وتمحيصها جهودًا عظيمة.</p>
      <p>واليوم تنتشر الأحاديث عبر المواقع والتطبيقات، لكن الوصول إلى مصادرها والتثبت من ألفاظها قد يكون صعبًا. ومن هنا نشأ أرشيف الحديث لخدمة السنة النبوية بما تتيحه الوسائل الحديثة.</p>
      <p>يجمع الأرشيف الأحاديث من كتب الحديث المشهورة مثل صحيح البخاري ومسلم، ويحفظ نصوصها كما طُبعت، مع ذكر الكتاب ودار النشر والطبعة ورقم الصفحة، حتى يسهل على القارئ الرجوع إلى المصدر والتثبت من النص.</p>
      <p>أرشيف الحديث مشروع مفتوح المصدر، تُتاح شيفراته وبياناته للجميع، ويمكن الاطلاع عليها والتحقق منها وتنزيلها وإعادة استخدامها كاملة من خلال المستودع.</p>
      <p>نرجو أن يكون الأرشيف حلقة وصل بين ما يقرأه الناس من أحاديث على الإنترنت ومصادرها في كتب السنة. نسأل الله أن يتقبله منا، وأن ينفع به، وأن يجعله خالصًا لوجهه الكريم.</p>
    </div>`;

/** Renders every page; the order of the result is the order of `path`. */
export function renderSite(inputs: SiteInputs, options: RenderOptions): readonly PageFile[] {
  const { core, site, topics } = inputs;
  // Links are root-absolute under the site's path, so the font preload and
  // the 404 page work at any depth; structured data needs whole addresses.
  const base = new URL(site.url).pathname.replace(/\/$/, "");
  const at = (route: string) => `${base}/${route}`;
  const absolute = (route: string) => `${site.url}/${route}`;
  const asset = (path: string) => `${at(path)}?v=${options.assetVersions[path] as string}`;
  const name = escapeHtml(site.name);
  const sourceUrl = escapeHtml(site.source_url);

  const layout = (page: PageContent): string => {
    const here = (current: Current) => page.current === current ? " aria-current=\"page\"" : "";
    const description = page.description === undefined
      ? ""
      : `\n  <meta name="description" content="${escapeHtml(page.description)}">`;
    return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="text-scale" content="scale">
  <meta name="robots" content="noindex">${description}
  <title>${escapeHtml(page.title)}</title>
  <link rel="preload" href="${at("font/UthmanTN_v2-0.woff2")}" as="font" type="font/woff2" crossorigin>
  <link rel="icon" href="${at("favicon.ico")}" sizes="32x32">
  <link rel="icon" href="${at("favicon.svg")}" type="image/svg+xml">
  <link rel="stylesheet" href="${asset("style.css")}">${page.head ?? ""}
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
      <ul>
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
      <li><a href="${sourceUrl}" rel="nofollow">المستودع</a></li>
      <li><a href="${sourceUrl}/blob/main/LICENSE" rel="nofollow">الرخصة</a></li>
    </ul>
  </footer>
  <script src="${asset("script.js")}"></script>
</body>
</html>
`;
  };

  const pages: PageFile[] = [];
  const add = (path: string, page: PageContent) => pages.push({ html: layout(page), path });
  const addRoute = (route: string, page: PageContent) => add(`${route}index.html`, page);
  const titled = (...parts: string[]) => [...parts, site.name].join(" - ");

  const index = buildIndex(core);
  const byOccurrence = compareOccurrences(index);
  const sources = [...core.sources].sort((left, right) => compareText(left.source_id, right.source_id));
  const hadith = [...core.hadith].sort((left, right) => left.hadith_id - right.hadith_id);
  const hadithById = new Map(hadith.map((record) => [record.hadith_id, record]));
  const topicOf = new Map(topics.flatMap((topic) => topic.hadith_ids.map((id) => [id, topic] as const)));

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
  // Anything listed before the hadith (a book's abwab) shows on the first.
  const addList = (
    route: string,
    title: readonly string[],
    current: Current,
    top: readonly string[],
    before: readonly string[],
    listed: readonly HadithRecord[],
  ) => {
    const last = Math.max(1, Math.ceil(listed.length / options.pageSize));
    for (let page = 1; page <= last; page += 1) {
      const cards = listed.slice((page - 1) * options.pageSize, page * options.pageSize);
      addRoute(pageRoute(route, page), {
        current: page === 1 ? current : undefined,
        main: [
          ...top,
          ...page === 1 ? before : [],
          ...cards.length === 0 ? [] : [`    <ol role="list">
${cards.map((record) =>
  `      <li><a href="${at(ROUTE.hadith(record.hadith_id))}"><span>${escapeHtml(preview(record.text))}</span>${ICON.arrow}</a></li>`
).join("\n")}
    </ol>`],
          ...last === 1 ? [] : [pager(route, page, last)],
        ].join("\n"),
        title: page === 1 ? titled(...title) : titled(title[0] as string, `الصفحة ${arabicDigits(page)}`, ...title.slice(1)),
      });
    }
  };

  // The site launches without search. Its title is the site's name, hidden
  // on screen, and before any topic is reviewed it shows books only.
  add("index.html", {
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
  });

  // GitHub Pages answers every missing address with this page.
  add("404.html", {
    main: `    <h1>${ICON.question}الصفحة غير موجودة</h1>`,
    title: titled("الصفحة غير موجودة"),
  });

  addRoute(ROUTE.about, { current: "about", main: ABOUT, title: `حول ${site.name}` });

  addRoute(ROUTE.categories, {
    current: "categories",
    main: `    <h1 id="aqsam">${ICON.grid}الأقسام</h1>
${facts([["عدد الأقسام", arabicDigits(topics.length)]])}
    <section aria-labelledby="aqsam">
${topicTiles(topics)}
    </section>`,
    title: titled("الأقسام"),
  });

  for (const topic of topics) {
    addList(ROUTE.topic(topic.topic_id), [topic.title], undefined, [
      `    <h1>${ICON.grid}${escapeHtml(topic.title)}</h1>`,
      facts([["عدد الأحاديث", arabicDigits(topic.hadith_ids.length)]]),
    ], [], topic.hadith_ids.map((id) => hadithById.get(id) as HadithRecord));
  }

  addRoute(ROUTE.books, {
    current: "books",
    main: `    <h1 id="kutub">${ICON.books}الكتب</h1>
${facts([["عدد الكتب", arabicDigits(sources.length)]])}
    <section aria-labelledby="kutub">
${bookCards(sources)}
    </section>`,
    title: titled("الكتب"),
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

  for (const source of sources) {
    const sections = core.sections
      .filter((section) => section.source_id === source.source_id)
      .sort((left, right) => left.ordinal - right.ordinal);
    const childrenOf = (parent: string | undefined) =>
      sections.filter((section) => section.parent_section_id === parent);
    // The book and its sections are presented as one witness printed them:
    // the highest priority, ties settled on the witness identifier. Nothing
    // falls back to another witness where the presenting one has no record.
    const presenting = core.witnesses
      .filter((witness) => witness.source_id === source.source_id)
      .sort((left, right) =>
        right.priority_score - left.priority_score || compareText(left.witness_id, right.witness_id)
      )[0];
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
    addList(ROUTE.source(source.source_id), [source.title], undefined, [
      `    <h1 id="abwab">${ICON.books}${escapeHtml(source.title)}</h1>`,
      facts([
        ["المؤلف", escapeHtml(source.author)],
        ...counted("عدد الأبواب", topSections.length),
        ...counted("عدد الأحاديث", hadithOf(occurrences).length),
      ]),
    ], sectionList(source.source_id, topSections),
    hadithOf(occurrences.filter((occurrence) => occurrence.section_id === undefined)));

    for (const section of sections) {
      const children = childrenOf(section.section_id);
      addList(ROUTE.section(source.source_id, section.section_id), [section.title, source.title], undefined, [
        `    <h1${children.length === 0 ? "" : " id=\"abwab\""}>${ICON.bookmark}${escapeHtml(section.title)}</h1>`,
        facts([
          ["الكتاب", bookLink(source)],
          ...counted("عدد الأبواب", children.length),
          ...counted("عدد الأحاديث", hadithOf(within(section.section_id)).length),
        ]),
      ], sectionList(source.source_id, children),
      hadithOf(occurrences.filter((occurrence) => occurrence.section_id === section.section_id)));
    }
  }

  const citation = (occurrence: OccurrenceRecord, indent: string) => {
    const witness = index.witness.get(occurrence.witness_id) as SourceWitnessRecord;
    const source = index.source.get(witness.source_id) as SourceRecord;
    const { hadith_number: number, page_end: end, page_start: start, volume } = occurrence.location;
    return facts([
      ["الكتاب", bookLink(source)],
      ["دار النشر", escapeHtml(witness.publisher)],
      ...witness.edition_statement === undefined
        ? []
        : [["الطبعة", escapeHtml(witness.edition_statement)] as const],
      ...volume === undefined ? [] : [["الجزء", arabicDigits(volume)] as const],
      // A page range uses the font's own hyphen; the Naskh has no en dash.
      ["الصفحة", start === end ? arabicDigits(start) : `${arabicDigits(start)}-${arabicDigits(end)}`],
      ...number === undefined ? [] : [["رقم الحديث", arabicDigits(number)] as const],
    ], indent);
  };

  // One narration: the printed text, folded when long, then its citation.
  const narration = (occurrence: OccurrenceRecord, indent: string) => {
    const fold = baseLength(occurrence.raw_text) > FOLD_BASE_CHARACTERS
      ? `\n${indent}    <details>\n${indent}      <summary><span>المزيد</span><span>أقل</span>${ICON.caret}</summary>\n${indent}    </details>`
      : "";
    return `${indent}<li id="occurrence-${occurrence.occurrence_id}">
${indent}  <div>
${indent}    <blockquote>
${paragraphs(occurrence.raw_text, `${indent}      `)}
${indent}    </blockquote>${fold}
${indent}  </div>
${citation(occurrence, `${indent}  `)}
${indent}</li>`;
  };

  for (const record of hadith) {
    const display = index.occurrence.get(record.display_occurrence_id) as OccurrenceRecord;
    const members = record.member_occurrence_ids
      .map((id) => index.occurrence.get(id) as OccurrenceRecord)
      .sort((left, right) =>
        Number(right.occurrence_id === display.occurrence_id) -
          Number(left.occurrence_id === display.occurrence_id) ||
        byOccurrence(left, right)
      );
    // A hadith's way back is its one category: a visible line under the
    // citation, and the same trail as breadcrumb data.
    const topic = topicOf.get(record.hadith_id);
    const trail = topic === undefined ? undefined : structuredData({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        ["الرئيسية", ROUTE.home],
        ["الأقسام", ROUTE.categories],
        [topic.title, ROUTE.topic(topic.topic_id)],
      ].map(([title, route], position) => ({
        "@type": "ListItem",
        position: position + 1,
        name: title,
        item: absolute(route as string),
      })),
    });
    // The saved text supplies the title, heading, and description alike.
    const plain = record.text.replaceAll("\n", " ");
    addRoute(ROUTE.hadith(record.hadith_id), {
      description: plain,
      head: trail,
      main: [
        "    <article>",
        `      <h1>${record.text.split("\n").map(escapeHtml).join("<br>")}</h1>`,
        citation(display, "      "),
        ...topic === undefined ? [] : [facts([
          ["القسم", `${ICON.grid}<a href="${at(ROUTE.topic(topic.topic_id))}">${escapeHtml(topic.title)}</a>`],
        ], "      ")],
        `      <section aria-labelledby="masadir">
        <h2 id="masadir">${ICON.books}المصادر</h2>
        <ol role="list">
${members.map((occurrence) => narration(occurrence, "          ")).join("\n")}
        </ol>
      </section>
    </article>`,
      ].join("\n"),
      title: titled(plain),
    });
  }

  return pages.sort((left, right) => compareText(left.path, right.path));
}
