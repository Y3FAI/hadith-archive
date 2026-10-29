import type {
  HadithRecord,
  OccurrenceRecord,
  SectionRecord,
  SourceRecord,
  SourceWitnessRecord,
} from "../../../packages/core-loader/src/index.ts";

import type { SiteInputs, Topic } from "./inputs.ts";

// Phosphor thin icons, exactly as in the handwritten demo.
const svg = (path: string) =>
  `<svg viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
const ICON = {
  books: svg("M104,36H56A12,12,0,0,0,44,48V208a12,12,0,0,0,12,12h48a12,12,0,0,0,12-12V48A12,12,0,0,0,104,36ZM52,76h56V180H52Zm4-32h48a4,4,0,0,1,4,4V68H52V48A4,4,0,0,1,56,44Zm48,168H56a4,4,0,0,1-4-4V188h56v20A4,4,0,0,1,104,212Zm123.74-16.62L194.55,37.57a12,12,0,0,0-14.25-9.3L133.49,38.32a12.1,12.1,0,0,0-9.23,14.3l33.19,157.81a12,12,0,0,0,14.25,9.3l46.81-10.06h0A12.08,12.08,0,0,0,227.74,195.38Zm-83.21-85.27,54.63-11.73,15,71.07-54.63,11.74Zm-6.64-31.56,54.64-11.74,5,23.74-54.64,11.73Zm-2.71-32.4L182,36.09a4,4,0,0,1,.84-.09,3.94,3.94,0,0,1,2.14.64,4,4,0,0,1,1.76,2.58L190.88,59,136.24,70.72,132.09,51A4.07,4.07,0,0,1,135.18,46.15Zm81.65,155.7L170,211.91a4,4,0,0,1-3-.55,4,4,0,0,1-1.76-2.58L161.12,189l54.64-11.73L219.91,197A4.07,4.07,0,0,1,216.83,201.85Z"),
  caret: svg("M210.83,98.83l-80,80a4,4,0,0,1-5.66,0l-80-80a4,4,0,0,1,5.66-5.66L128,170.34l77.17-77.17a4,4,0,1,1,5.66,5.66Z"),
  chevron: svg("M162.83,205.17a4,4,0,0,1-5.66,5.66l-80-80a4,4,0,0,1,0-5.66l80-80a4,4,0,1,1,5.66,5.66L85.66,128Z"),
  close: svg("M202.83,197.17a4,4,0,0,1-5.66,5.66L128,133.66,58.83,202.83a4,4,0,0,1-5.66-5.66L122.34,128,53.17,58.83a4,4,0,0,1,5.66-5.66L128,122.34l69.17-69.17a4,4,0,1,1,5.66,5.66L133.66,128Z"),
  grid: svg("M104,44H56A12,12,0,0,0,44,56v48a12,12,0,0,0,12,12h48a12,12,0,0,0,12-12V56A12,12,0,0,0,104,44Zm4,60a4,4,0,0,1-4,4H56a4,4,0,0,1-4-4V56a4,4,0,0,1,4-4h48a4,4,0,0,1,4,4Zm92-60H152a12,12,0,0,0-12,12v48a12,12,0,0,0,12,12h48a12,12,0,0,0,12-12V56A12,12,0,0,0,200,44Zm4,60a4,4,0,0,1-4,4H152a4,4,0,0,1-4-4V56a4,4,0,0,1,4-4h48a4,4,0,0,1,4,4ZM104,140H56a12,12,0,0,0-12,12v48a12,12,0,0,0,12,12h48a12,12,0,0,0,12-12V152A12,12,0,0,0,104,140Zm4,60a4,4,0,0,1-4,4H56a4,4,0,0,1-4-4V152a4,4,0,0,1,4-4h48a4,4,0,0,1,4,4Zm92-60H152a12,12,0,0,0-12,12v48a12,12,0,0,0,12,12h48a12,12,0,0,0,12-12V152A12,12,0,0,0,200,140Zm4,60a4,4,0,0,1-4,4H152a4,4,0,0,1-4-4V152a4,4,0,0,1,4-4h48a4,4,0,0,1,4,4Z"),
  home: svg("M216.49,111.51l-80-80a12,12,0,0,0-17,0l-80,80A12,12,0,0,0,36,120v96a4,4,0,0,0,4,4h64a4,4,0,0,0,4-4V156h40v60a4,4,0,0,0,4,4h64a4,4,0,0,0,4-4V120A12,12,0,0,0,216.49,111.51ZM212,212H156V152a4,4,0,0,0-4-4H104a4,4,0,0,0-4,4v60H44V120a4,4,0,0,1,1.17-2.83l80-80a4,4,0,0,1,5.66,0l80,80A4,4,0,0,1,212,120Z"),
  info: svg("M140,176a4,4,0,0,1-4,4,12,12,0,0,1-12-12V128a4,4,0,0,0-4-4,4,4,0,0,1,0-8,12,12,0,0,1,12,12v40a4,4,0,0,0,4,4A4,4,0,0,1,140,176ZM124,92a8,8,0,1,0-8-8A8,8,0,0,0,124,92Zm104,36A100,100,0,1,1,128,28,100.11,100.11,0,0,1,228,128Zm-8,0a92,92,0,1,0-92,92A92.1,92.1,0,0,0,220,128Z"),
  logo: svg("M100,104a4,4,0,0,1,4-4h64a4,4,0,0,1,0,8H104A4,4,0,0,1,100,104Zm4,36h64a4,4,0,0,0,0-8H104a4,4,0,0,0,0,8Zm124,52a28,28,0,0,1-28,28H88a28,28,0,0,1-28-28V64a20,20,0,0,0-40,0c0,7.78,6.34,12.75,6.4,12.8a4,4,0,1,1-4.8,6.4C21.21,82.91,12,75.86,12,64A28,28,0,0,1,40,36H176a28,28,0,0,1,28,28V172h12a4,4,0,0,1,2.4.8C218.79,173.09,228,180.14,228,192Zm-120,0c0-7.78-6.34-12.75-6.4-12.8A4,4,0,0,1,104,172h92V64a20,20,0,0,0-20-20H59.57A27.9,27.9,0,0,1,68,64V192a20,20,0,0,0,40,0Zm112,0c0-6-3.74-10.3-5.5-12H112.61A23.31,23.31,0,0,1,116,192a27.94,27.94,0,0,1-8.42,20H200A20,20,0,0,0,220,192Z"),
  menu: svg("M220,128a4,4,0,0,1-4,4H40a4,4,0,0,1,0-8H216A4,4,0,0,1,220,128ZM40,68H216a4,4,0,0,0,0-8H40a4,4,0,0,0,0,8ZM216,188H40a4,4,0,0,0,0,8H216a4,4,0,0,0,0-8Z"),
  pin: svg("M232.49,84.2,171.8,23.51a12,12,0,0,0-17,0L99.45,79.07c-8.08-3-32.79-9.45-59,11.67a12,12,0,0,0-1,17.84l51.13,51.13L45.17,205.17a4,4,0,0,0,5.66,5.66l45.46-45.47,51.12,51.12A12,12,0,0,0,155.9,220c.28,0,.57,0,.85,0a12,12,0,0,0,8.73-4.74c19.83-26.36,16.51-47.18,11.71-58.57l55.3-55.49A12,12,0,0,0,232.49,84.2Zm-5.66,11.31h0L169.56,153a4,4,0,0,0-.75,4.61c10.43,20.85-1.62,42-9.73,52.83a4,4,0,0,1-6,.4L45.17,102.93a4,4,0,0,1,.33-6C58.44,86.53,70.86,83.74,80.44,83.74A43.9,43.9,0,0,1,98.6,87.38a4,4,0,0,0,4.62-.75l57.27-57.46a4,4,0,0,1,5.66,0l60.68,60.69A4,4,0,0,1,226.83,95.51Z"),
  search: svg("M226.83,221.17l-52.7-52.7a84.1,84.1,0,1,0-5.66,5.66l52.7,52.7a4,4,0,0,0,5.66-5.66ZM36,112a76,76,0,1,1,76,76A76.08,76.08,0,0,1,36,112Z"),
};

// A narration longer than this many base characters (combining marks are not
// counted) opens with «المزيد». The demo's 258-character narration shows
// whole, and its 537-character one is folded.
export const FOLD_BASE_CHARACTERS = 400;

// A browse card quotes only the opening words of the saved text: whole
// words up to this many base characters, then «...». The full text is on
// the hadith's own page alone.
export const PREVIEW_BASE_CHARACTERS = 60;

/** One generated file, by its forward-slash path inside the output directory. */
export interface PageFile {
  readonly path: string;
  readonly html: string;
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

const segment = (value: string | number) => encodeURIComponent(String(value));
const hadithHref = (id: number) => `/h/${segment(id)}/`;
const sourceHref = (sourceId: string) => `/b/${segment(sourceId)}/`;
const sectionHref = (sourceId: string, sectionId: string) =>
  `/b/${segment(sourceId)}/${segment(sectionId)}/`;
const topicHref = (id: number) => `/c/${segment(id)}/`;
const witnessHref = (witnessId: string) => `/w/${segment(witnessId)}/`;

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
  const shown = words.slice(0, kept).join(" ");
  return kept < words.length ? `${shown}...` : shown;
}

type Current = "about" | "books" | "categories" | "home" | undefined;

function layout(
  site: SiteInputs["site"],
  title: string,
  current: Current,
  main: string,
  description?: string,
): string {
  const here = (page: Current) => current === page ? " aria-current=\"page\"" : "";
  const sourceUrl = escapeHtml(site.source_url);
  const meta = description === undefined
    ? ""
    : `\n  <meta name="description" content="${escapeHtml(description)}">`;
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">${meta}
  <title>${escapeHtml(title)}</title>
  <link rel="preload" href="/font/UthmanTN_v2-0.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header>
    <a href="/"${here("home")}>${ICON.logo}${escapeHtml(site.name)}</a>
    <button type="button" popovertarget="menu" aria-label="القائمة">
      ${ICON.menu}
    </button>
    <nav id="menu" popover>
      <button type="button" popovertarget="menu" popovertargetaction="hide" aria-label="إغلاق القائمة">
        ${ICON.close}
      </button>
      <ul>
        <li><a href="/"${here("home")}>${ICON.home}الرئيسية</a></li>
        <li><a href="/c/"${here("categories")}>${ICON.grid}الأقسام</a></li>
        <li><a href="/b/"${here("books")}>${ICON.books}الكتب</a></li>
      </ul>
    </nav>
  </header>
  <main>
${main}
  </main>
  <footer>
    <ul>
      <li><a href="/about/"${here("about")}>حول</a></li>
      <li><a href="${sourceUrl}" rel="nofollow">المستودع</a></li>
      <li><a href="${sourceUrl}/blob/main/LICENSE" rel="nofollow">الرخصة</a></li>
    </ul>
  </footer>
  <script src="/script.js"></script>
</body>
</html>
`;
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

function citation(index: Index, occurrence: OccurrenceRecord, indent: string): string {
  const witness = index.witness.get(occurrence.witness_id) as SourceWitnessRecord;
  const source = index.source.get(witness.source_id) as SourceRecord;
  const { hadith_number: number, page_end: end, page_start: start, volume } = occurrence.location;
  const items = [
    `<div><dt>الكتاب</dt><dd>${ICON.pin}<cite><a href="${sourceHref(source.source_id)}">${escapeHtml(source.title)}</a></cite></dd></div>`,
    `<div><dt>الطبعة</dt><dd>${escapeHtml(witness.edition_statement)}</dd></div>`,
    ...volume === undefined ? [] : [`<div><dt>الجزء</dt><dd>${arabicDigits(volume)}</dd></div>`],
    `<div><dt>الصفحة</dt><dd>${start === end ? arabicDigits(start) : `${arabicDigits(start)}–${arabicDigits(end)}`}</dd></div>`,
    ...number === undefined ? [] : [`<div><dt>رقم الحديث</dt><dd>${arabicDigits(number)}</dd></div>`],
  ];
  return `${indent}<dl>\n${items.map((item) => `${indent}  ${item}`).join("\n")}\n${indent}</dl>`;
}

// One card in a list: the quoted text, folded when long, then its citation.
function card(
  id: string,
  text: string,
  cite: (indent: string) => string,
  indent: string,
): string {
  const fold = baseLength(text) > FOLD_BASE_CHARACTERS
    ? `\n${indent}    <details>\n${indent}      <summary><span>المزيد</span><span>أقل</span>${ICON.caret}</summary>\n${indent}    </details>`
    : "";
  return `${indent}<li id="${id}">
${indent}  <div>
${indent}    <blockquote>
${paragraphs(text, `${indent}      `)}
${indent}    </blockquote>${fold}
${indent}  </div>
${cite(`${indent}  `)}
${indent}</li>`;
}

// Browse pages show no narration or citation: each hadith appears once, as
// a card of its opening words that leads to its own page.
function hadithList(records: readonly HadithRecord[]): string {
  return `    <ol>
${records.map((record) =>
  `      <li><a href="${hadithHref(record.hadith_id)}"><span>${escapeHtml(preview(record.text))}</span>${ICON.chevron}</a></li>`
).join("\n")}
    </ol>`;
}

function sectionList(sourceId: string, sections: readonly SectionRecord[]): string {
  return `    <section aria-labelledby="abwab">
      <ul>
${sections.map((section) =>
  `        <li><a href="${sectionHref(sourceId, section.section_id)}">${escapeHtml(section.title)}</a></li>`
).join("\n")}
      </ul>
    </section>`;
}

// A book's printed editions, each leading to its own witness page.
function editionList(witnesses: readonly SourceWitnessRecord[]): string {
  return `    <section aria-labelledby="tabaat">
      <h2 id="tabaat">${ICON.books}الطبعات</h2>
      <ul>
${witnesses.map((witness) =>
  `        <li><a href="${witnessHref(witness.witness_id)}">${escapeHtml(witness.title_as_printed)}<span>${escapeHtml(witness.edition_statement)}</span></a></li>`
).join("\n")}
      </ul>
    </section>`;
}

const ABOUT =`    <h1>${ICON.info}حول أرشيف الحديث</h1>
    <div>
      <p>حفظ الله سنة نبيه ﷺ، وسخّر لها عبر القرون علماء اعتنوا بروايتها وجمعها وتدوينها، وبذلوا في دراستها وتمحيصها جهودًا عظيمة.</p>
      <p>واليوم تنتشر الأحاديث عبر المواقع والتطبيقات، لكن الوصول إلى مصادرها والتثبت من ألفاظها قد يكون صعبًا. ومن هنا نشأ أرشيف الحديث لخدمة السنة النبوية بما تتيحه الوسائل الحديثة.</p>
      <p>يجمع الأرشيف الأحاديث من كتب الحديث المشهورة مثل صحيح البخاري ومسلم، ويحفظ نصوصها كما طُبعت، مع ذكر الكتاب ودار النشر والطبعة ورقم الصفحة، حتى يسهل على القارئ الرجوع إلى المصدر والتثبت من النص.</p>
      <p>أرشيف الحديث مشروع مفتوح المصدر، تُتاح شيفراته وبياناته للجميع، ويمكن الاطلاع عليها والتحقق منها وتنزيلها وإعادة استخدامها كاملة من خلال المستودع.</p>
      <p>نرجو أن يكون الأرشيف حلقة وصل بين ما يقرأه الناس من أحاديث على الإنترنت ومصادرها في كتب السنة. نسأل الله أن يتقبله منا، وأن ينفع به، وأن يجعله خالصًا لوجهه الكريم.</p>
    </div>`;

/** Renders every page; the order of the result is the order of `path`. */
export function renderSite(inputs: SiteInputs): readonly PageFile[] {
  const { core, site, topics } = inputs;
  const index = buildIndex(core);
  const byOccurrence = compareOccurrences(index);
  const sources = [...core.sources].sort((left, right) => compareText(left.source_id, right.source_id));
  const hadith = [...core.hadith].sort((left, right) => left.hadith_id - right.hadith_id);
  const hadithById = new Map(hadith.map((record) => [record.hadith_id, record]));
  const pages: PageFile[] = [];
  const add = (path: string, title: string, current: Current, main: string, description?: string) =>
    pages.push({ html: layout(site, title, current, main, description), path });

  const topicTiles = (items: readonly Topic[]) => items.map((topic) =>
    `        <li><a href="${topicHref(topic.topic_id)}">${escapeHtml(topic.title)}</a></li>`
  ).join("\n");
  const bookCards = sources.map((source) =>
    `        <li><a href="${sourceHref(source.source_id)}">${escapeHtml(source.title)}<span>${escapeHtml(source.author)}</span></a></li>`
  ).join("\n");

  add("index.html", site.name, "home", `    <search>
      <form action="/search/">
        <h1><label for="q">ابحث في الأحاديث</label></h1>
        <div>
          <input id="q" name="q" type="search" placeholder="اكتب هنا للبحث" enterkeyhint="search" autocomplete="off">
          <button type="submit" aria-label="ابحث">${ICON.search}</button>
        </div>
      </form>
    </search>
    <section aria-labelledby="aqsam">
      <h2 id="aqsam"><a href="/c/">${ICON.grid}الأقسام</a></h2>
      <a href="/c/">المزيد${ICON.chevron}</a>
      <ul>
${topicTiles(topics)}
      </ul>
    </section>
    <section aria-labelledby="kutub">
      <h2 id="kutub"><a href="/b/">${ICON.books}الكتب</a></h2>
      <a href="/b/">المزيد${ICON.chevron}</a>
      <ul>
${bookCards}
      </ul>
    </section>`);

  add("about/index.html", "حول أرشيف الحديث", "about", ABOUT);

  // Search is not decided; the home form lands here instead of failing.
  add("search/index.html", "البحث", undefined, `    <h1>${ICON.search}البحث</h1>
    <div>
      <p>البحث غير متاح في هذا العرض التجريبي.</p>
    </div>`);

  add("c/index.html", "الأقسام", "categories", `    <h1 id="aqsam">${ICON.grid}الأقسام</h1>
    <section aria-labelledby="aqsam">
      <ul>
${topicTiles(topics)}
      </ul>
    </section>`);

  for (const topic of topics) {
    add(`c/${topic.topic_id}/index.html`, topic.title, undefined, [
      `    <h1>${ICON.grid}${escapeHtml(topic.title)}</h1>`,
      hadithList(topic.hadith_ids.map((id) => hadithById.get(id) as HadithRecord)),
    ].join("\n"));
  }

  // Each hadith once, where the first of its occurrences comes.
  const hadithOf = (occurrences: readonly OccurrenceRecord[]) => [
    ...new Set(occurrences.flatMap((occurrence) => index.hadithByMember.get(occurrence.occurrence_id) ?? [])),
  ];

  add("b/index.html", "الكتب", "books", `    <h1 id="kutub">${ICON.books}الكتب</h1>
    <section aria-labelledby="kutub">
      <ul>
${bookCards}
      </ul>
    </section>`);

  for (const source of sources) {
    const sections = core.sections
      .filter((section) => section.source_id === source.source_id)
      .sort((left, right) => left.ordinal - right.ordinal);
    // The book and its sections are presented as one witness printed them:
    // the highest priority, ties settled on the witness identifier. Nothing
    // falls back to another witness where the presenting one has no record.
    const witnesses = core.witnesses
      .filter((witness) => witness.source_id === source.source_id)
      .sort((left, right) =>
        right.priority_score - left.priority_score || compareText(left.witness_id, right.witness_id)
      );
    const presenting = witnesses[0];
    const occurrences = presenting === undefined
      ? []
      : core.occurrences
        .filter((occurrence) => occurrence.witness_id === presenting.witness_id)
        .sort(byOccurrence);
    const page = (
      title: string,
      path: string,
      children: readonly SectionRecord[],
      own: readonly OccurrenceRecord[],
      editions: readonly SourceWitnessRecord[] = [],
    ) => {
      const listed = hadithOf(own);
      add(path, title, undefined, [
        `    <h1 id="abwab">${ICON.books}${escapeHtml(title)}</h1>`,
        ...children.length === 0 ? [] : [sectionList(source.source_id, children)],
        ...listed.length === 0 ? [] : [hadithList(listed)],
        ...editions.length === 0 ? [] : [editionList(editions)],
      ].join("\n"));
    };
    page(
      source.title,
      `b/${source.source_id}/index.html`,
      sections.filter((section) => section.parent_section_id === undefined),
      occurrences.filter((occurrence) => occurrence.section_id === undefined),
      witnesses,
    );
    for (const section of sections) {
      page(
        section.title,
        `b/${source.source_id}/${section.section_id}/index.html`,
        sections.filter((child) => child.parent_section_id === section.section_id),
        occurrences.filter((occurrence) => occurrence.section_id === section.section_id),
      );
    }
  }

  // Every witness, presenting or not, lists the hadith of all its
  // occurrences in printed order, so each grouped one stays reachable.
  for (const witness of core.witnesses) {
    const listed = hadithOf(core.occurrences
      .filter((occurrence) => occurrence.witness_id === witness.witness_id)
      .sort(byOccurrence));
    add(`w/${witness.witness_id}/index.html`, witness.title_as_printed, undefined, [
      `    <h1>${ICON.books}${escapeHtml(witness.title_as_printed)}</h1>`,
      ...listed.length === 0 ? [] : [hadithList(listed)],
    ].join("\n"));
  }

  for (const record of hadith) {
    const display = index.occurrence.get(record.display_occurrence_id) as OccurrenceRecord;
    const members = record.member_occurrence_ids
      .map((id) => index.occurrence.get(id) as OccurrenceRecord)
      .sort((left, right) =>
        Number(right.occurrence_id === display.occurrence_id) -
          Number(left.occurrence_id === display.occurrence_id) ||
        byOccurrence(left, right)
      );
    // The saved text supplies the title, heading, and description alike.
    const plain = record.text.replaceAll("\n", " ");
    add(`h/${record.hadith_id}/index.html`, plain, undefined, `    <article>
      <h1>${record.text.split("\n").map(escapeHtml).join("<br>")}</h1>
${citation(index, display, "      ")}
      <section aria-labelledby="masadir">
        <h2 id="masadir">${ICON.books}المصادر</h2>
        <ol>
${members.map((occurrence) => card(
  `occurrence-${occurrence.occurrence_id}`,
  occurrence.raw_text,
  (indent) => citation(index, occurrence, indent),
  "          ",
)).join("\n")}
        </ol>
      </section>
    </article>`, plain);
  }

  return pages.sort((left, right) => compareText(left.path, right.path));
}
