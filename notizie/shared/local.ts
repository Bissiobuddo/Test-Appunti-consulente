import { fetchArticles, type Article, type FetchText } from "./feeds.ts";
import { feedsFor, type CategoryId } from "./sources.ts";
import type { CategoryDigest, Story } from "./schema.ts";
import type { SourceSelection } from "./digest.ts";

// Rassegna senza AI: raggruppa gli articoli simili, conta le testate che li riportano,
// confronta le cifre e usa come testo il sommario pubblicato dalla testata (citata).

const STOP = new Set(
  (
    "il lo la i gli le un uno una di a da in con su per tra fra e ed o od ma che chi non piu come dopo prima " +
    "sono e era ha hanno ho anche al allo alla ai agli alle del dello della dei degli delle dal dallo dalla dai " +
    "dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle col coi questo questa questi " +
    "quello quella quelli oggi ieri domani suo sua suoi sue loro ecco cosa quando dove perche se si ci ne vi " +
    "tutto tutti tutte nuovo nuova nuovi anni anno via mai gia ancora ora molto poi cosi solo fino contro " +
    "verso senza sotto sopra essere stato stata fare fa video foto news live diretta " +
    "the of to and an in on for is are was were with by at from as after over new says said its it this that be has have"
  ).split(" "),
);

const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Parole significative, troncate per unire singolare/plurale e maschile/femminile. */
export function stems(text: string): string[] {
  return plain(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d{1,2}$/.test(w))
    .map((w) => (/^\d+$/.test(w) ? w : w.slice(0, 6)));
}

type Vector = Map<string, number>;

function vectors(articles: Article[], withSummary: boolean): Vector[] {
  const docs = articles.map((a) => {
    const tf = new Map<string, number>();
    for (const s of stems(a.title)) tf.set(s, (tf.get(s) ?? 0) + 2);
    if (withSummary) for (const s of stems(a.summary.slice(0, 300))) tf.set(s, (tf.get(s) ?? 0) + 1);
    return tf;
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const s of d.keys()) df.set(s, (df.get(s) ?? 0) + 1);
  const n = articles.length;
  return docs.map((d) => {
    const v: Vector = new Map();
    let norm = 0;
    for (const [s, tf] of d) {
      const w = tf * Math.log(1 + n / (df.get(s) ?? 1));
      v.set(s, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [s, w] of v) v.set(s, w / norm);
    return v;
  });
}

function cosine(a: Vector, b: Vector): number {
  let sum = 0;
  for (const [s, w] of a) sum += w * (b.get(s) ?? 0);
  return sum;
}

/** Soglia di somiglianza sopra la quale due articoli parlano dello stesso fatto. */
const SAME_STORY = 0.3;

/** Raggruppa gli articoli: ognuno va nel gruppo con l'articolo più simile, se abbastanza simile. */
export function clusterArticles(articles: Article[]): Article[][] {
  // Si confrontano sia i soli titoli sia titoli e sommari: un sommario lungo non deve nascondere un titolo simile.
  const titles = vectors(articles, false);
  const full = vectors(articles, true);
  const similarity = (i: number, j: number) => Math.max(cosine(titles[i], titles[j]), cosine(full[i], full[j]));
  const clusters: number[][] = [];
  articles.forEach((_, i) => {
    let best = -1;
    let bestSim = SAME_STORY;
    clusters.forEach((members, c) => {
      const sim = Math.max(...members.map((m) => similarity(i, m)));
      if (sim >= bestSim) {
        best = c;
        bestSim = sim;
      }
    });
    if (best >= 0) clusters[best].push(i);
    else clusters.push([i]);
  });
  // Il primo articolo di ogni gruppo è il più "centrale": il più simile agli altri.
  return clusters.map((members) => {
    const score = (i: number) => members.reduce((sum, m) => sum + (m === i ? 0 : similarity(i, m)), 0);
    return [...members].sort((a, b) => score(b) - score(a)).map((i) => articles[i]);
  });
}

const IGNORED_UNITS = new Set(["anni", "anno", "ore", "minuti", "giorni", "mesi", "settimane", "punti"]);
// Una cifra, l'eventuale scala e la parola che conta ("12 le vittime" → vittime).
const NUMBER = /(?<![\p{L}\d])(\d+(?:[.,]\d+)*)\s*(%|per cento|mila|milioni|miliardi)?\s*(?:(?:i|gli|le|il|la|di|dei|degli|delle)\s+)?(\p{L}{4,})?/giu;

interface Figure {
  /** Valore normalizzato, per confrontare "1.000" e "1000". */
  value: string;
  label: string;
}

/** Cifre citate da un articolo, indicizzate per cosa contano (es. 30 → "morti"). */
function figures(a: Article): Map<string, Figure> {
  const out = new Map<string, Figure>();
  for (const [, value, scale, word] of `${a.title}. ${a.summary}`.matchAll(NUMBER)) {
    if (/^(19|20)\d\d$/.test(value)) continue; // anni
    const pct = scale === "%" || scale === "per cento";
    const w = word ? plain(word) : "";
    if (!pct && (!w || IGNORED_UNITS.has(w) || STOP.has(w))) continue;
    const key = pct ? `% ${w.slice(0, 6)}` : `${scale ?? ""} ${w.slice(0, 6)}`;
    if (out.has(key)) continue;
    out.set(key, {
      value: `${value.replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")}${scale && !pct ? scale : ""}`,
      label: `${value}${pct ? "%" : scale ? ` ${scale}` : ""}${word ? ` ${word}` : ""}`,
    });
  }
  return out;
}

/** Cifre diverse sulla stessa cosa tra testate diverse. */
function numericDiscrepancies(cluster: Article[]): Story["discrepancies"] {
  const bySource = new Map<string, { ids: number[]; figs: Map<string, Figure> }>();
  for (const a of cluster) {
    const entry = bySource.get(a.sourceName) ?? { ids: [], figs: new Map<string, Figure>() };
    entry.ids.push(a.id);
    for (const [k, v] of figures(a)) if (!entry.figs.has(k)) entry.figs.set(k, v);
    bySource.set(a.sourceName, entry);
  }
  const keys = new Set([...bySource.values()].flatMap((e) => [...e.figs.keys()]));
  const out: Story["discrepancies"] = [];
  for (const key of keys) {
    const versions = new Map<string, { label: string; ids: number[] }>();
    for (const e of bySource.values()) {
      const f = e.figs.get(key);
      if (f) versions.set(f.value, { label: versions.get(f.value)?.label ?? f.label, ids: [...(versions.get(f.value)?.ids ?? []), ...e.ids] });
    }
    if (versions.size > 1) {
      out.push({
        point: "Le cifre riportate non coincidono",
        versions: [...versions.values()].map((v) => ({ article_ids: v.ids, claim: v.label })),
      });
    }
  }
  return out.slice(0, 2);
}

const CAVEATS: [RegExp, string][] = [
  [/\b(sarebbe|sarebbero|avrebbe|avrebbero)\b/i, "Si usa il condizionale («sarebbe», «avrebbe»): parte delle informazioni non è ancora confermata."],
  [/indiscrezion|\bsecondo (fonti|alcune fonti|quanto si apprende)|\brumors?\b/i, "Si basa in parte su indiscrezioni o fonti non ufficiali."],
  [/sondagg/i, "Cita un sondaggio: è una stima delle opinioni, non un risultato."],
  [/\b(accus|denunc|indagat|indagine|inchiesta|arrest)/i, "Ci sono accuse o indagini in corso: non equivalgono a una condanna."],
  [/\b(stime?|ipotes|provvisori|bilancio provvisorio)/i, "Riporta stime o ipotesi, che possono cambiare."],
];

function caveatsFor(cluster: Article[]): string[] {
  const text = cluster.map((a) => `${a.title}. ${a.summary}`).join(" ");
  const found = CAVEATS.filter(([re]) => re.test(text)).map(([, msg]) => msg);
  if (cluster.some((a) => a.title.trim().endsWith("?"))) found.push("Un titolo è una domanda: non afferma un fatto.");
  return found;
}

function toStory(cluster: Article[]): Story {
  const lead = cluster[0];
  const sources = [...new Set(cluster.map((a) => a.sourceName))];
  const discrepancies = numericDiscrepancies(cluster);
  const allAgencies = sources.length > 1 && cluster.every((a) => a.kind === "agenzia");
  const summarySource = lead.summary ? lead : (cluster.find((a) => a.summary) ?? lead);

  const reliability: Story["reliability"] = sources.length < 2 ? "fonte_unica" : discrepancies.length ? "parziale" : "confermata";
  const note =
    sources.length < 2
      ? `La riporta solo ${lead.sourceName} tra le testate consultate: va presa con cautela finché altri non la confermano.`
      : `Riportata da ${sources.length} testate diverse (${sources.join(", ")})${discrepancies.length ? ", ma con cifre diverse" : ""}.` +
        (allAgencies ? " Sono tutte agenzie di stampa." : "");

  return {
    title: lead.title,
    summary: summarySource.summary || lead.title,
    summary_source: summarySource.summary ? summarySource.sourceName : undefined,
    key_points: [],
    importance: sources.length >= 4 ? "alta" : sources.length >= 2 ? "media" : "bassa",
    article_ids: cluster.map((a) => a.id),
    reliability,
    reliability_note: `${note} Confronto automatico su titoli e sommari, senza AI.`,
    discrepancies,
    caveats: caveatsFor(cluster),
    glossary: [],
  };
}

/** Le notizie più riprese (più testate diverse), a parità le più recenti. */
export function summarizeLocally(articles: Article[], maxStories: number): Story[] {
  const sourcesOf = (c: Article[]) => new Set(c.map((a) => a.sourceName)).size;
  const newest = (c: Article[]) => Math.max(0, ...c.map((a) => a.publishedAt ?? 0));
  return clusterArticles(articles)
    .sort((a, b) => sourcesOf(b) - sourcesOf(a) || newest(b) - newest(a))
    .slice(0, maxStories)
    .map(toStory);
}

/** Come buildCategoryDigest, ma tutto in locale: nessuna chiave e nessun costo. */
export async function buildLocalDigest(
  category: CategoryId,
  selection: SourceSelection,
  maxStories: number,
  fetchText: FetchText,
): Promise<CategoryDigest> {
  const feeds = feedsFor(category, selection.disabledSources, selection.customFeeds);
  const { articles, failedSources } = await fetchArticles(feeds, fetchText);
  if (!articles.length && failedSources.length) throw new Error("Nessuna fonte raggiungibile per questa categoria. Controlla la connessione.");
  const stories = summarizeLocally(articles, maxStories);
  const cited = new Set(stories.flatMap((s) => s.article_ids));
  return {
    category,
    engine: "locale",
    generatedAt: Date.now(),
    stories,
    articles: articles.filter((a) => cited.has(a.id)),
    failedSources,
    articleCount: articles.length,
  };
}
