import { XMLParser } from "fast-xml-parser";
import type { FeedRef, SourceKind } from "./sources.ts";

/** Un articolo letto da un feed. L'id numerico è quello con cui l'AI cita le fonti. */
export interface Article {
  id: number;
  sourceId: string;
  sourceName: string;
  kind: SourceKind;
  title: string;
  summary: string;
  url: string;
  publishedAt?: number;
}

/** Scarica il testo di un feed. Sul server è fetch, nell'app Android l'HTTP nativo (senza vincoli CORS). */
export type FetchText = (url: string) => Promise<string>;

export interface FetchOptions {
  /** Articoli più vecchi di così vengono scartati (quelli senza data si tengono). */
  maxAgeHours?: number;
  perFeed?: number;
  maxArticles?: number;
  now?: number;
}

export interface FetchResult {
  articles: Article[];
  /** Nomi delle fonti di cui non è stato possibile leggere alcun feed. */
  failedSources: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  htmlEntities: true,
  isArray: (name) => name === "item" || name === "entry" || name === "link",
});

type Node = Record<string, unknown>;

const NAMED: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", ndash: "–", mdash: "—", egrave: "è", eacute: "é", agrave: "à", igrave: "ì", ograve: "ò", ugrave: "ù", Egrave: "È" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED[code] ?? m;
  });
}

/** Testo semplice da un nodo XML che può contenere HTML (spesso nei sommari). */
function text(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === "object") return text((value as Node)["#text"]);
  return decodeEntities(String(value).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function linkOf(item: Node): string {
  const links = (item.link as unknown[] | undefined) ?? [];
  for (const l of links) {
    if (typeof l === "string" && l.trim()) return l.trim();
    if (l && typeof l === "object") {
      const node = l as Node;
      const rel = node["@_rel"];
      if (typeof node["@_href"] === "string" && (!rel || rel === "alternate")) return node["@_href"];
      if (typeof node["#text"] === "string") return node["#text"].trim();
    }
  }
  const guid = item.guid;
  const g = typeof guid === "object" && guid ? (guid as Node)["#text"] : guid;
  return typeof g === "string" && /^https?:\/\//.test(g) ? g : "";
}

function dateOf(item: Node): number | undefined {
  for (const key of ["pubDate", "dc:date", "published", "updated"]) {
    const t = Date.parse(text(item[key]));
    if (Number.isFinite(t)) return t;
  }
  return undefined;
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max).replace(/\s+\S*$/, "")}…` : s);

/** Legge un feed RSS 2.0, RSS 1.0 (RDF) o Atom. */
export function parseFeed(xml: string): Omit<Article, "id" | "sourceId" | "sourceName" | "kind">[] {
  const doc = parser.parse(xml) as Node;
  const rss = doc.rss as Node | undefined;
  const items =
    ((rss?.channel as Node | undefined)?.item as Node[] | undefined) ??
    ((doc["rdf:RDF"] as Node | undefined)?.item as Node[] | undefined) ??
    ((doc.feed as Node | undefined)?.entry as Node[] | undefined) ??
    [];
  return items
    .map((item) => {
      const title = text(item.title);
      const summary = text(item.description ?? item.summary ?? item.content);
      return {
        title,
        summary: clip(summary === title ? "" : summary, 400),
        url: linkOf(item),
        publishedAt: dateOf(item),
      };
    })
    .filter((a) => a.title && a.url);
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Scarica i feed in parallelo, scarta i doppioni e le notizie vecchie, numera gli articoli. */
export async function fetchArticles(feeds: FeedRef[], fetchText: FetchText, opts: FetchOptions = {}): Promise<FetchResult> {
  const { maxAgeHours = 30, perFeed = 12, maxArticles = 140, now = Date.now() } = opts;
  const minTime = now - maxAgeHours * 3600_000;

  const results = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const items = parseFeed(await fetchText(feed.url))
          .filter((a) => !a.publishedAt || a.publishedAt >= minTime)
          .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
          .slice(0, perFeed);
        return { feed, items, ok: true };
      } catch {
        return { feed, items: [], ok: false };
      }
    }),
  );

  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const merged: Omit<Article, "id">[] = [];
  for (const { feed, items } of results) {
    for (const item of items) {
      const titleKey = `${feed.sourceId}|${normalize(item.title)}`;
      if (seenUrls.has(item.url) || seenTitles.has(titleKey)) continue;
      seenUrls.add(item.url);
      seenTitles.add(titleKey);
      merged.push({ ...item, sourceId: feed.sourceId, sourceName: feed.sourceName, kind: feed.kind });
    }
  }

  // Una fonte "fallisce" solo se nessuno dei suoi feed per la categoria ha risposto.
  const okSources = new Set(results.filter((r) => r.ok).map((r) => r.feed.sourceName));
  const failedSources = [...new Set(results.filter((r) => !r.ok).map((r) => r.feed.sourceName))].filter((n) => !okSources.has(n));

  const articles = merged
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, maxArticles)
    .map((a, i) => ({ ...a, id: i + 1 }));
  return { articles, failedSources };
}
