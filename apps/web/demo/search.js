// The search page. The field's words go to the search service; while it
// works, the field and its button rest and three empty cards pulse where
// the results will be, which then fade in, top first. When the service
// cannot answer, the words are searched here instead, in the site's own
// copy of the texts. Each search gets its own address, so the browser's
// back button returns to the one before.

const script = document.currentScript;
const api = script.dataset.api;
const hadith = script.dataset.hadith; // a hadith's page is this, its number and a slash
const zone = document.querySelector("main > search");
const form = zone.querySelector("form");
const input = form.elements.q;
const button = form.querySelector("button");
const card = document.querySelector("main > template").content.firstElementChild;
const status = document.querySelector('main > [role="status"]');
const title = document.title;
const site = title.slice(title.indexOf(" - ")); // « - » and the site's name

const digits = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
const asked = () => (new URLSearchParams(location.search).get("q") ?? "").trim().replace(/\s+/g, " ");

// What shows under the field: the count and the results, or a message.
let shown = [];

function show(...parts) {
  for (const part of shown) part.remove();
  shown = parts;
  zone.after(...parts.filter((part) => part.localName !== "p"));
  form.after(...parts.filter((part) => part.localName === "p"));
}

function say(text) {
  const message = document.createElement("p");
  message.textContent = text;
  status.textContent = text;
  show(message);
}

// The search service's results, by words and meaning. The service itself
// answers by words alone when meaning is slow, so the wait here is only
// for a network that does not answer.
async function byService(query) {
  const response = await fetch(`${api}/?${new URLSearchParams({ q: query })}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`search service: ${response.status}`);
  return (await response.json()).results;
}

// The same search by words alone, with the service's engine; the engine
// and the texts are fetched once, at the first search that needs them.
let local;

function byWords(query) {
  local ??= Promise.all([import(script.dataset.engine), fetch(script.dataset.texts).then((response) => response.json())])
    .then(([engine, texts]) => ({ engine, searcher: engine.prepare(texts) }))
    .catch((error) => {
      local = undefined;
      throw error;
    });
  return local.then(({ engine, searcher }) => engine.results(searcher, query));
}

let latest = 0;

async function run(query) {
  const mine = ++latest;
  input.value = query;
  document.title = query === "" ? title : `${query} - نتائج البحث${site}`;
  status.textContent = "";
  input.disabled = query !== "";
  button.disabled = query !== "";
  if (query === "") {
    show();
    return;
  }

  const count = document.createElement("dl");
  count.innerHTML = "<div><dt>عدد النتائج</dt><dd></dd></div>";
  const list = document.createElement("ol");
  list.setAttribute("role", "list");
  list.setAttribute("aria-busy", "true");
  for (let i = 0; i < 3; i++) {
    const waiting = document.createElement("li");
    waiting.append(document.createElement("span"), document.createElement("span"));
    list.append(waiting);
  }
  show(count, list);

  try {
    const results = await byService(query).catch(() => byWords(query));
    if (mine !== latest) return;
    if (results.length === 0) {
      say("لا توجد نتائج.");
      return;
    }
    // Every second part of a result's text is a searched word, on gold.
    list.replaceChildren(...results.map((result, i) => {
      const item = card.cloneNode(true);
      const link = item.firstElementChild;
      link.href = `${hadith}${result.id}/`;
      link.firstElementChild.append(...result.parts.map((part, j) =>
        j % 2 === 0 ? part : Object.assign(document.createElement("mark"), { textContent: part })));
      item.style.animationDelay = `${Math.min(i, 10) * 30}ms`;
      return item;
    }));
    list.removeAttribute("aria-busy");
    count.querySelector("dd").textContent = digits(results.length);
    status.textContent = `عدد النتائج ${digits(results.length)}`;
  } catch {
    if (mine === latest) say("تعذر البحث الآن، فأعد المحاولة بعد قليل.");
  } finally {
    if (mine === latest) {
      input.disabled = false;
      button.disabled = false;
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = input.value.trim().replace(/\s+/g, " ");
  if (query !== asked()) {
    history.pushState(null, "", query === "" ? location.pathname : `?${new URLSearchParams({ q: query })}`);
  }
  run(query);
});

addEventListener("popstate", () => run(asked()));

run(asked());
