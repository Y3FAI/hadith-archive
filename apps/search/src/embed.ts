// A Worker run only on this computer, never deployed, for scripts/data.ts:
//   cd apps/search && wrangler dev src/embed.ts --ip 127.0.0.1
// POST / with a JSON array of HADITH texts answers with their vectors.
import type { Env } from "./index.ts";
import { MODEL, textPrompt } from "./search.ts";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const texts = (await request.json()) as string[];
    const output = (await env.AI.run(MODEL, { text: texts.map(textPrompt) })) as { data: number[][] };
    return Response.json(output.data);
  },
};
