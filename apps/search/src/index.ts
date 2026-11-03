// The search service, a Cloudflare Worker: GET /?q= answers with the HADITH
// that match a query, best first, each with the stretch of its text to show
// and the searched words in it. Texts where every word matched come first,
// then the five closest by meaning; when Workers AI fails or is slow, the
// words answer alone.
import data from "../data.json";
import { cosine, type Doc, MODEL, prepare, queryPrompt, type Result, results, words } from "./search.ts";

export interface Env {
  readonly AI: { run(model: string, input: { readonly text: readonly string[] }): Promise<unknown> };
  /** The deployed version, which changes with every deploy. */
  readonly CF_VERSION_METADATA: { readonly id: string };
}

interface Context {
  waitUntil(promise: Promise<unknown>): void;
}

// The cache of the Cloudflare data centre that answers.
declare const caches: {
  readonly default: {
    match(request: Request): Promise<Response | undefined>;
    put(request: Request, response: Response): Promise<void>;
  };
};

if (data.model !== MODEL) {
  throw new Error(`data.json was embedded by ${data.model}, not ${MODEL}`);
}
const DOCS: readonly Doc[] = data.hadith;
const SEARCHER = prepare(DOCS);
// Long enough for any quoted passage.
const MAX_QUERY = 500;
// How long Workers AI may take before the words answer alone, in milliseconds.
const MEANING_WAIT = 4000;

/** The results of a query, given its vector by meaning when Workers AI made one. */
export function answer(query: string, vector: readonly number[] | undefined): Result[] {
  return results(SEARCHER, query, vector === undefined ? undefined : DOCS
    .map((doc) => ({ id: doc.id, score: cosine(vector, doc.vector) }))
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .map((hit) => hit.id));
}

const HEADERS = {
  // Any page may search, as anyone may download the data.
  "access-control-allow-origin": "*",
  "content-type": "application/json; charset=utf-8",
};

export default {
  async fetch(request: Request, env: Env, context: Context): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/") {
      return new Response(null, { headers: HEADERS, status: 404 });
    }
    const query = (url.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_QUERY);
    if (words(query).length === 0) {
      return Response.json({ results: [] }, { headers: HEADERS });
    }
    // One answer per query and deploy, kept by the data centre, so a query
    // asked again skips Workers AI and a new deploy never answers from an old one.
    const key = new Request(`${url.origin}/?q=${encodeURIComponent(query)}&v=${env.CF_VERSION_METADATA.id}`);
    const cached = await caches.default.match(key);
    if (cached !== undefined) {
      return cached;
    }
    let vector: number[] | undefined;
    try {
      vector = await Promise.race([
        env.AI.run(MODEL, { text: [queryPrompt(query)] }).then((output) => (output as { data: number[][] }).data[0]),
        new Promise<undefined>((resolve) => setTimeout(resolve, MEANING_WAIT)),
      ]);
    } catch {
      // Such as past the day's free allowance.
    }
    // Only an answer that used meaning is kept.
    const response = Response.json({ results: answer(query, vector) }, {
      headers: { ...HEADERS, "cache-control": vector === undefined ? "no-store" : "public, max-age=3600" },
    });
    if (vector !== undefined) {
      context.waitUntil(caches.default.put(key, response.clone() as Response));
    }
    return response;
  },
};
