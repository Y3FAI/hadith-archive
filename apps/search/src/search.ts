// Search over the saved text of every HADITH, by its words and by its meaning.
// Records and queries pass through the same normalizer and light stemmer
// (Larkey's light10), and texts are ranked by BM25 over stems, with bonuses
// for exact word forms and for query words that stay adjacent. Meaning is
// the cosine of embeddinggemma vectors, made by Workers AI. The search
// service runs this file, and the site's build serves it, its types
// removed, to the search page, which searches by words alone when the
// service cannot answer.

/** The model that makes every vector, with its prompts for queries and texts. */
export const MODEL = "@cf/google/embeddinggemma-300m";
export const queryPrompt = (query: string) => `task: search result | query: ${plain(query)}`;
export const textPrompt = (text: string) => `title: none | text: ${plain(text)}`;

/** One HADITH to search. */
export interface SearchText {
  readonly id: number;
  /** HADITH.text, exactly. */
  readonly text: string;
  /** Where the Prophet's words begin in the text, in code points, where the printing marks them. */
  readonly words?: number;
}

/** One HADITH as the search service holds it, with its vector by meaning. */
export interface Doc extends SearchText {
  readonly vector: readonly number[];
}

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** Harakat, Quranic marks and tatweel removed; ﷺ spelt out. */
export function plain(text: string): string {
  return text.replace(/ﷺ/g, "صلى الله عليه وسلم").replace(MARKS, "");
}

/** Plain text with one form per letter family, digits as ASCII, words split by single spaces. */
export function normalize(text: string): string {
  return plain(text)
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .toLowerCase()
    .replace(/[^ء-ي0-9a-z]+/g, " ")
    .trim();
}

export function words(text: string): string[] {
  const normal = normalize(text);
  return normal === "" ? [] : normal.split(" ");
}

const PREFIXES = ["وال", "بال", "كال", "فال", "لل", "ال"];
const SUFFIXES = ["ها", "ان", "ات", "ون", "ين", "يه", "ه", "ي"];

/** Larkey's light10 on a normalized word (ة is already ه). */
export function stem(word: string): string {
  let w = word;
  if (w.length > 3 && w.startsWith("و")) w = w.slice(1);
  for (const prefix of PREFIXES) {
    if (w.startsWith(prefix) && w.length - prefix.length >= 2) {
      w = w.slice(prefix.length);
      break;
    }
  }
  for (let again = true; again;) {
    again = false;
    for (const suffix of SUFFIXES) {
      if (w.endsWith(suffix) && w.length - suffix.length >= 2) {
        w = w.slice(0, -suffix.length);
        again = true;
        break;
      }
    }
  }
  return w;
}

// Each key's documents (by position in the index), with the word positions in each.
type Postings = Map<number, number[]>;

export interface Index {
  readonly average: number;
  readonly docs: readonly number[];
  readonly forms: ReadonlyMap<string, Postings>;
  readonly lengths: readonly number[];
  readonly roots: ReadonlyMap<string, Postings>;
  readonly stems: ReadonlyMap<string, Postings>;
}

/** An index over texts: stems, exact forms and roots, each with positions per text. */
export function buildIndex(docs: readonly { readonly id: number; readonly text: string }[]): Index {
  const stems = new Map<string, Postings>();
  const forms = new Map<string, Postings>();
  const roots = new Map<string, Postings>();
  const lengths: number[] = [];
  const add = (map: Map<string, Postings>, key: string, doc: number, position: number) => {
    let postings = map.get(key);
    if (postings === undefined) map.set(key, postings = new Map());
    let positions = postings.get(doc);
    if (positions === undefined) postings.set(doc, positions = []);
    positions.push(position);
  };
  docs.forEach((doc, d) => {
    const list = words(doc.text);
    lengths.push(list.length);
    list.forEach((word, position) => {
      add(stems, stem(word), d, position);
      add(forms, word, d, position);
      add(roots, root(word), d, position);
    });
  });
  const average = lengths.reduce((sum, n) => sum + n, 0) / Math.max(1, lengths.length);
  return { average, docs: docs.map((doc) => doc.id), forms, lengths, roots, stems };
}

function distanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

export interface Hit {
  readonly id: number;
  readonly score: number;
  /** Every query word matched. */
  readonly all: boolean;
}

/**
 * Texts ranked by a query's words. A word without a stem match is tried as
 * the start of a word when it is the last one typed, then with one letter
 * wrong when it has four letters or more; one with the same root counts for less.
 */
export function search(index: Index, query: string): Hit[] {
  const N = index.docs.length;
  // An unknown word typed joined to the next, such as «لاتغضب», is split in two known words.
  const known = (word: string) => index.stems.has(stem(word)) || index.forms.has(word);
  const terms = [...new Set(words(query).flatMap((word) => {
    if (known(word)) return [word];
    for (let i = 2; i <= word.length - 2; i++) {
      if (index.forms.has(word.slice(0, i)) && known(word.slice(i))) return [word.slice(0, i), word.slice(i)];
    }
    return [word];
  }))];
  const scores = new Map<number, { matched: number; score: number }>();
  const entry = (d: number) => {
    let found = scores.get(d);
    if (found === undefined) scores.set(d, found = { matched: 0, score: 0 });
    return found;
  };
  const positionsByTerm: Postings[] = [];
  const idf = (df: number) => Math.log(1 + (N - df + 0.5) / (df + 0.5));
  terms.forEach((term, t) => {
    let postings = index.stems.get(stem(term));
    let weight = 1;
    if (postings === undefined) {
      const keys = [...index.forms.keys()];
      let near = t === terms.length - 1 ? keys.filter((form) => form.startsWith(term)) : [];
      if (near.length === 0 && term.length >= 4) {
        near = keys.filter((form) => distanceAtMostOne(form, term));
        weight = 0.7;
      }
      if (near.length > 0) {
        const merged: Postings = new Map();
        for (const form of near) {
          for (const [d, positions] of index.forms.get(form) as Postings) {
            merged.set(d, [...merged.get(d) ?? [], ...positions]);
          }
        }
        postings = merged;
      }
    }
    positionsByTerm.push(postings ?? new Map());
    const termRoot = root(term);
    const byRoot = index.roots.get(termRoot);
    if (byRoot !== undefined && termRoot.length >= 3) {
      const rootIdf = idf(byRoot.size);
      for (const d of byRoot.keys()) {
        if (postings?.has(d)) continue;
        const found = entry(d);
        found.score += 0.4 * rootIdf;
        found.matched += 0.5;
      }
    }
    if (postings === undefined) return;
    const termIdf = idf(postings.size);
    const exact = index.forms.get(term);
    for (const [d, positions] of postings) {
      const tf = positions.length;
      const norm = tf + 1.2 * (1 - 0.75 + 0.75 * (index.lengths[d] as number) / index.average);
      let score = weight * termIdf * (tf * 2.2) / norm;
      if (exact?.has(d)) score += 0.5 * termIdf;
      const found = entry(d);
      found.score += score;
      found.matched += 1;
    }
  });
  // Adjacent query words found adjacent in the text.
  for (let t = 0; t + 1 < positionsByTerm.length; t++) {
    for (const [d, positions] of positionsByTerm[t] as Postings) {
      const next = (positionsByTerm[t + 1] as Postings).get(d);
      if (next === undefined) continue;
      const following = new Set(next);
      if (positions.some((p) => following.has(p + 1))) entry(d).score += 1.5;
    }
  }
  return [...scores]
    .map(([d, { matched, score }]) => ({
      all: matched === terms.length,
      id: index.docs[d] as number,
      score: score * (matched / terms.length) ** 2,
    }))
    .sort((a, b) => b.score - a.score || a.id - b.id);
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / Math.sqrt(na * nb);
}

// ISRI root extraction (Taghva, Elkhoribi and Coombs, 2005), as in NLTK, on a
// normalized word: prefixes and suffixes go, then the word's pattern gives
// its three-letter root. Imperfect, so roots count less than stems.
const P3 = ["كال", "بال", "ولل", "وال"];
const P2 = ["ال", "لل"];
const P1 = ["ل", "ب", "ف", "س", "و", "ي", "ت", "ن", "ا"];
const S3 = ["تمل", "همل", "تان", "تين", "كمل"];
const S2 = ["ون", "ات", "ان", "ين", "تن", "كم", "هن", "نا", "يا", "ها", "تم", "كن", "ني", "وا", "ما", "هم"];
const S1 = ["ه", "ي", "ك", "ت", "ا", "ن"];
const suf1 = (w: string) => S1.some((s) => w.endsWith(s)) ? w.slice(0, -1) : w;
const pre1 = (w: string) => P1.some((p) => w.startsWith(p)) ? w.slice(1) : w;
// The letter at a position; a word of the length tested always has it.
const at = (w: string, i: number) => w[i] as string;

function w4(w: string): string {
  if (at(w, 0) === "م") return w.slice(1);
  if (at(w, 1) === "ا") return at(w, 0) + w.slice(2);
  if ("اوي".includes(at(w, 2))) return w.slice(0, 2) + at(w, 3);
  if (at(w, 3) === "ه") return w.slice(0, 3);
  const cut = suf1(w);
  return cut.length === 4 ? pre1(cut) : cut;
}

function w53(w: string): string {
  if ("ات".includes(at(w, 2)) && at(w, 0) === "ا") return at(w, 1) + w.slice(3);
  if ("ايو".includes(at(w, 3)) && at(w, 0) === "م") return w.slice(1, 3) + at(w, 4);
  if ("اتم".includes(at(w, 0)) && at(w, 4) === "ه") return w.slice(1, 4);
  if ("ميت".includes(at(w, 0)) && at(w, 2) === "ت") return at(w, 1) + w.slice(3);
  if ("مت".includes(at(w, 0)) && at(w, 2) === "ا") return at(w, 1) + w.slice(3);
  if ("او".includes(at(w, 2)) && at(w, 4) === "ه") return w.slice(0, 2) + at(w, 3);
  if ("ام".includes(at(w, 0)) && at(w, 1) === "ن") return w.slice(2);
  if (at(w, 3) === "ا" && at(w, 0) === "ا") return w.slice(1, 3) + at(w, 4);
  if (at(w, 4) === "ن" && at(w, 3) === "ا") return w.slice(0, 3);
  if (at(w, 3) === "ي" && at(w, 0) === "ت") return w.slice(1, 3) + at(w, 4);
  if (at(w, 3) === "و" && at(w, 1) === "ا") return at(w, 0) + at(w, 2) + at(w, 4);
  if (at(w, 2) === "ا" && at(w, 1) === "و") return at(w, 0) + w.slice(3);
  if (at(w, 3) === "ئ" && at(w, 2) === "ا") return w.slice(0, 2) + at(w, 4);
  if (at(w, 4) === "ه" && at(w, 1) === "ا") return at(w, 0) + w.slice(2, 4);
  if (at(w, 4) === "ي" && at(w, 2) === "ا") return w.slice(0, 2) + at(w, 3);
  const cut = suf1(w);
  return cut.length === 5 ? pre1(cut) : cut;
}

function w54(w: string): string {
  if ("اتم".includes(at(w, 0))) return w.slice(1);
  if (at(w, 4) === "ه") return w.slice(0, 4);
  if (at(w, 2) === "ا") return w.slice(0, 2) + w.slice(3);
  return w;
}

const end5 = (w: string) => w.length === 4 ? w4(w) : w.length === 5 ? w54(w) : w;

function w6(w: string): string {
  if (w.startsWith("است") || w.startsWith("مست")) return w.slice(3);
  if (at(w, 0) === "م" && at(w, 3) === "ا" && at(w, 5) === "ه") return w.slice(1, 3) + at(w, 4);
  if (at(w, 0) === "ا" && at(w, 2) === "ت" && at(w, 4) === "ا") return at(w, 1) + at(w, 3) + at(w, 5);
  if (at(w, 0) === "ا" && at(w, 3) === "و" && at(w, 2) === at(w, 4)) return at(w, 1) + w.slice(4);
  if (at(w, 0) === "ت" && at(w, 2) === "ا" && at(w, 4) === "ي") return at(w, 1) + at(w, 3) + at(w, 5);
  const cut = suf1(w);
  return cut.length === 6 ? pre1(cut) : cut;
}

function w64(w: string): string {
  if (at(w, 0) === "ا" && at(w, 4) === "ا") return w.slice(1, 4) + at(w, 5);
  if (w.startsWith("مت")) return w.slice(2);
  return w;
}

const end6 = (w: string) => w.length === 5 ? end5(w53(w)) : w.length === 6 ? w64(w) : w;

export function root(word: string): string {
  let w = word;
  if (w.length >= 6) {
    const prefix = P3.find((p) => w.startsWith(p));
    if (prefix !== undefined) w = w.slice(3);
  }
  if (w === word && w.length >= 5) {
    const prefix = P2.find((p) => w.startsWith(p));
    if (prefix !== undefined) w = w.slice(2);
  }
  const before = w;
  if (w.length >= 6) {
    const suffix = S3.find((s) => w.endsWith(s));
    if (suffix !== undefined) w = w.slice(0, -3);
  }
  if (w === before && w.length >= 5) {
    const suffix = S2.find((s) => w.endsWith(s));
    if (suffix !== undefined) w = w.slice(0, -2);
  }
  if (w.length >= 4 && w.startsWith("وو")) w = w.slice(1);
  if (w.length === 4) {
    w = w4(w);
  } else if (w.length === 5) {
    w = end5(w53(w));
  } else if (w.length === 6) {
    w = end6(w6(w));
  } else if (w.length === 7) {
    w = suf1(w);
    if (w.length === 7) w = pre1(w);
    if (w.length === 6) w = end6(w6(w));
  }
  return w;
}

// A result's text: this many words, from a little before its first searched word.
const SHOWN_WORDS = 40;
const BY_MEANING = 5;
const SMALL = new Set(["في", "من", "عن", "علي", "الي", "ان", "ما", "لا", "او", "ثم", "قد", "يا"]);

/** Texts ready to search. */
export interface Searcher {
  readonly byId: ReadonlyMap<number, SearchText>;
  /** Stems found in most texts, such as that of «الله», which are not marked. */
  readonly common: ReadonlySet<string>;
  readonly index: Index;
}

export function prepare(texts: readonly SearchText[]): Searcher {
  const index = buildIndex(texts);
  return {
    byId: new Map(texts.map((text) => [text.id, text])),
    common: new Set([...index.stems].filter(([, postings]) => postings.size > texts.length / 2).map(([key]) => key)),
    index,
  };
}

/** A HADITH found, with the text to show in parts: every second part is a searched word. */
export interface Result {
  readonly id: number;
  readonly parts: readonly string[];
}

// The text from a little before its first searched word, else from the
// Prophet's words; a word counts as searched by its stem or its root, and
// small words, common ones and ﷺ never do.
export function preview(searcher: Searcher, doc: SearchText, query: string): string[] {
  const asked = words(query).filter((word) => !SMALL.has(word) && !searcher.common.has(stem(word)));
  const stems = new Set(asked.map(stem));
  const roots = new Set(asked.map(root).filter((key) => key.length >= 3));
  const hit = (token: string) => !token.includes("\uFDFA") &&
    words(token).some((word) => !SMALL.has(word) && (stems.has(stem(word)) || roots.has(root(word))));
  // Words at even positions, the spaces between them at odd ones.
  const tokens = doc.text.split(/(\s+)/);
  const first = tokens.findIndex((token, i) => i % 2 === 0 && hit(token));
  let start = first > 24 ? first - 8 : 0;
  if (first < 0 && doc.words !== undefined) {
    start = [...doc.text].slice(0, doc.words).join("").split(/(\s+)/).length - 1;
  }
  start -= start % 2;
  const parts = [start > 0 ? "… " : ""];
  tokens.slice(start, start + 2 * SHOWN_WORDS).forEach((token, i) => {
    if (i % 2 === 0 && hit(token)) {
      parts.push(token, "");
    } else {
      parts[parts.length - 1] += token;
    }
  });
  return parts;
}

/**
 * The results of a query: texts where every word matched, then, given the
 * texts ranked by meaning, the five closest. By words alone, texts that
 * match some of the words follow when none matches all.
 */
export function results(searcher: Searcher, query: string, byMeaning?: readonly number[]): Result[] {
  const hits = search(searcher.index, query);
  const all = hits.filter((hit) => hit.all).map((hit) => hit.id);
  let ids = all;
  if (byMeaning === undefined) {
    if (all.length === 0) ids = hits.slice(0, 10).map((hit) => hit.id);
  } else {
    // A score by meaning ranks but cannot tell how many are relevant, so a fixed number follow.
    const taken = new Set(all);
    ids = [...all, ...byMeaning.filter((id) => !taken.has(id)).slice(0, BY_MEANING)];
  }
  return ids.map((id) => ({ id, parts: preview(searcher, searcher.byId.get(id) as SearchText, query) }));
}
