import type { Article } from "./feeds.ts";
import { SOURCES } from "./sources.ts";

/** Una voce di Wikipedia che spiega un nome o una sigla della notizia. */
export interface WikiTerm {
  term: string;
  page: string;
  explanation: string;
  url: string;
}

export type FetchJson = (url: string) => Promise<unknown>;

const NOT_TERMS = new Set(
  (
    "il lo la i gli le un uno una di da in con su per tra fra e ma che chi non come dopo prima ecco ora oggi ieri domani " +
    "lunedì martedì mercoledì giovedì venerdì sabato domenica gennaio febbraio marzo aprile maggio giugno luglio agosto " +
    "settembre ottobre novembre dicembre video foto news live diretta allerta ultim ultime breaking the a an of " +
    "governo premier ministro ministra presidente sindaco"
  ).split(" "),
);

const SOURCE_NAMES = new Set(SOURCES.map((s) => s.name.toLowerCase()));

// Nomi propri (anche di più parole, con «di», «del», «della»…) e sigle in maiuscolo.
const NAME = /(?:\p{Lu}[\p{L}'’.-]*\p{Ll}[\p{L}'’-]*|\p{Lu}{2,6})(?:\s+(?:(?:di|del|della|dei|degli|delle|de|d['’]|dell['’])\s*)?(?:\p{Lu}[\p{L}'’-]*\p{Ll}[\p{L}'’-]*|\p{Lu}{2,6}))*/gu;

/** Nomi e sigle che conviene spiegare, dai più citati. */
export function candidateTerms(articles: Article[], max = 5): string[] {
  const count = new Map<string, { term: string; n: number }>();
  for (const a of articles) {
    for (const text of [a.title, a.summary]) {
      for (const m of text.matchAll(NAME)) {
        // Toglie articoli e parole comuni in testa ("La Banca" → "Banca").
        const words = m[0].replace(/[’']$/, "").trim().split(/\s+/);
        let dropped = 0;
        while (words.length && NOT_TERMS.has(words[0].toLowerCase())) {
          words.shift();
          dropped++;
        }
        const term = words.join(" ");
        const key = term.toLowerCase();
        // Una parola sola a inizio frase è spesso solo maiuscola per posizione.
        const atStart = !dropped && (m.index === 0 || /[.!?:«"]\s*$/.test(text.slice(0, m.index)));
        if (!term || NOT_TERMS.has(key) || SOURCE_NAMES.has(key) || term.length < 2) continue;
        if (atStart && !term.includes(" ") && !/^\p{Lu}{2,}$/u.test(term)) continue;
        const entry = count.get(key) ?? { term, n: 0 };
        entry.n += term.includes(" ") || /^\p{Lu}{2,}$/u.test(term) ? 2 : 1;
        count.set(key, entry);
      }
    }
  }
  return [...count.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((e) => e.term);
}

interface SearchResponse {
  query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string; index?: number }> };
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, "")}…` : s);
const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Cerca il termine su Wikipedia in italiano e ne prende le prime frasi. */
export async function lookupTerm(term: string, fetchJson: FetchJson): Promise<WikiTerm | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    redirects: "1",
    generator: "search",
    gsrsearch: term,
    gsrlimit: "1",
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    exsentences: "2",
    inprop: "url",
  });
  const data = (await fetchJson(`https://it.wikipedia.org/w/api.php?${params}`)) as SearchResponse;
  const page = Object.values(data.query?.pages ?? {})[0];
  const extract = page?.extract?.replace(/\s+/g, " ").trim();
  if (!page || !extract || /può riferirsi|può indicare|disambigua/i.test(extract)) return null;
  // La voce deve avere almeno una parola in comune col termine, altrimenti è un risultato a caso.
  const words = plain(term).split(/\W+/).filter((w) => w.length > 2);
  if (words.length && !words.some((w) => plain(page.title).includes(w.slice(0, 5)))) return null;
  return { term, page: page.title, explanation: clip(extract, 320), url: page.fullurl ?? `https://it.wikipedia.org/wiki/${encodeURIComponent(page.title)}` };
}

/** Spiegazioni da Wikipedia per i nomi e le sigle della notizia (modalità senza AI). */
export async function explainWithWikipedia(articles: Article[], fetchJson: FetchJson): Promise<WikiTerm[]> {
  const terms = candidateTerms(articles);
  const found = await Promise.all(terms.map((t) => lookupTerm(t, fetchJson).catch(() => null)));
  const seen = new Set<string>();
  return found.filter((t): t is WikiTerm => {
    if (!t || seen.has(t.page)) return false;
    seen.add(t.page);
    return true;
  });
}
