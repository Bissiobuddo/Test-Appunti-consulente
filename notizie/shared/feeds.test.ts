import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchArticles, parseFeed } from "./feeds.ts";
import type { FeedRef } from "./sources.ts";

const NOW = Date.parse("2026-10-29T10:00:00Z");

const rss = (items: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Test</title>${items}</channel></rss>`;

const item = (title: string, link: string, date: string, desc = "") =>
  `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${date}</pubDate><description><![CDATA[${desc}]]></description></item>`;

test("legge RSS 2.0 con HTML ed entità nel sommario", () => {
  const [a] = parseFeed(
    rss(item("Manovra, l&#39;accordo è vicino", "https://ex.it/1", "Thu, 29 Oct 2026 08:00:00 +0100", "<p>Il governo &egrave; al lavoro&nbsp;<b>sulla legge</b></p>")),
  );
  assert.equal(a.title, "Manovra, l'accordo è vicino");
  assert.equal(a.summary, "Il governo è al lavoro sulla legge");
  assert.equal(a.url, "https://ex.it/1");
  assert.equal(a.publishedAt, Date.parse("2026-10-29T07:00:00Z"));
});

test("legge Atom con link come attributo", () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="html">Titolo atom</title>
    <link rel="alternate" href="https://ex.org/a"/><updated>2026-10-29T09:00:00Z</updated><summary>Sommario</summary></entry></feed>`;
  const [a] = parseFeed(xml);
  assert.deepEqual(a, { title: "Titolo atom", summary: "Sommario", url: "https://ex.org/a", publishedAt: Date.parse("2026-10-29T09:00:00Z") });
});

test("legge RSS 1.0 (RDF) con dc:date", () => {
  const xml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
    <item><title>Rdf</title><link>https://ex.net/r</link><dc:date>2026-10-29T06:00:00Z</dc:date></item></rdf:RDF>`;
  assert.equal(parseFeed(xml)[0].url, "https://ex.net/r");
});

test("unisce i feed, scarta vecchi e doppioni, numera e segnala le fonti irraggiungibili", async () => {
  const feeds: FeedRef[] = [
    { sourceId: "a", sourceName: "Fonte A", kind: "agenzia", url: "https://a/1" },
    { sourceId: "a", sourceName: "Fonte A", kind: "agenzia", url: "https://a/2" },
    { sourceId: "b", sourceName: "Fonte B", kind: "quotidiano", url: "https://b/1" },
    { sourceId: "c", sourceName: "Fonte C", kind: "quotidiano", url: "https://c/down" },
  ];
  const bodies: Record<string, string> = {
    "https://a/1": rss(item("Notizia uno", "https://a.it/1", "Thu, 29 Oct 2026 09:00:00 GMT") + item("Vecchia", "https://a.it/old", "Mon, 26 Oct 2026 09:00:00 GMT")),
    // stesso articolo in due feed della stessa fonte
    "https://a/2": rss(item("Notizia uno", "https://a.it/1?ref=x", "Thu, 29 Oct 2026 09:00:00 GMT")),
    "https://b/1": rss(item("Notizia uno secondo B", "https://b.it/1", "Thu, 29 Oct 2026 09:30:00 GMT")),
  };
  const { articles, failedSources } = await fetchArticles(
    feeds,
    async (url) => {
      if (!bodies[url]) throw new Error("offline");
      return bodies[url];
    },
    { now: NOW },
  );
  assert.deepEqual(
    articles.map((a) => [a.id, a.sourceName, a.title]),
    [
      [1, "Fonte B", "Notizia uno secondo B"],
      [2, "Fonte A", "Notizia uno"],
    ],
  );
  assert.deepEqual(failedSources, ["Fonte C"]);
});
