import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { buildCategoryDigest, RefusalError } from "./digest.ts";
import type { Story } from "./schema.ts";

const now = new Date().toUTCString();
const feed = (title: string, link: string) =>
  `<rss><channel><item><title>${title}</title><link>${link}</link><pubDate>${now}</pubDate><description>Sommario di ${title}</description></item></channel></rss>`;

const story = (ids: number[]): Story => ({
  title: "Titolo",
  summary: "Riassunto",
  key_points: [],
  importance: "alta",
  article_ids: ids,
  reliability: "confermata",
  reliability_note: "Due fonti",
  discrepancies: [{ point: "Cifre", versions: [{ article_ids: [1, 99], claim: "10" }] }],
  caveats: [],
  glossary: [],
});

/** Client finto: registra la richiesta e restituisce la risposta indicata. */
function fakeClient(response: object, seen: unknown[] = []) {
  return {
    beta: {
      messages: {
        parse: async (params: unknown) => {
          seen.push(params);
          return response;
        },
      },
    },
  } as unknown as Anthropic;
}

const fetchText = async (url: string) => {
  if (url.includes("ansa.it/sito/notizie/sport")) return feed("Gol all'ultimo minuto", "https://ansa.it/a");
  if (url.includes("gazzetta")) return feed("Vittoria in rimonta", "https://gazzetta.it/b");
  throw new Error("offline");
};

test("riassume una categoria, scarta gli id inventati e tiene solo gli articoli citati", async () => {
  const seen: { model: string; messages: { content: string }[] }[] = [];
  const client = fakeClient({ stop_reason: "end_turn", parsed_output: { stories: [story([2, 1, 1, 42]), story([77])] } }, seen);
  const digest = await buildCategoryDigest("sport", { disabledSources: ["agi"] }, { model: "claude-sonnet-5-5", maxStories: 5 }, fetchText, client);

  assert.equal(seen[0].model, "claude-sonnet-5-5");
  assert.match(seen[0].messages[0].content, /\[1\] .*\n.*Titolo: /);
  assert.equal(digest.articleCount, 2);
  assert.equal(digest.stories.length, 1, "la notizia con soli id inesistenti viene scartata");
  assert.deepEqual(digest.stories[0].article_ids, [2, 1]);
  assert.deepEqual(digest.stories[0].discrepancies[0].versions[0].article_ids, [1]);
  assert.deepEqual(digest.articles.map((a) => a.sourceName).sort(), ["ANSA", "La Gazzetta dello Sport"]);
  assert.ok(!digest.failedSources.includes("AGI"), "le fonti disattivate non vengono interrogate");
  assert.ok(digest.failedSources.includes("Rai News"));
});

test("segnala il rifiuto del modello", async () => {
  const client = fakeClient({ stop_reason: "refusal", stop_details: { explanation: "no" } });
  await assert.rejects(buildCategoryDigest("sport", {}, { model: "claude-opus-5-5", maxStories: 5 }, fetchText, client), RefusalError);
});

test("senza fonti raggiungibili non chiama l'AI", async () => {
  const seen: unknown[] = [];
  await assert.rejects(
    buildCategoryDigest("mondo", {}, { model: "claude-opus-5-5", maxStories: 5 }, async () => Promise.reject(new Error("offline")), fakeClient({}, seen)),
    /Nessuna fonte raggiungibile/,
  );
  assert.equal(seen.length, 0);
});
