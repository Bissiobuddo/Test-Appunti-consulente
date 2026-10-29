import { test } from "node:test";
import assert from "node:assert/strict";
import type { Article } from "./feeds.ts";
import { clusterArticles, summarizeLocally } from "./local.ts";
import { candidateTerms, lookupTerm } from "./wikipedia.ts";

let nextId = 1;
const art = (sourceName: string, title: string, summary = "", kind: Article["kind"] = "quotidiano"): Article => ({
  id: nextId++,
  sourceId: sourceName.toLowerCase(),
  sourceName,
  kind,
  title,
  summary,
  url: `https://example.org/${nextId}`,
  publishedAt: Date.parse("2026-10-29T08:00:00Z") - nextId * 60_000,
});

const articles = [
  art("ANSA", "Manovra, approvato in commissione l'emendamento sulle pensioni", "Riguarda circa 30 mila lavoratori", "agenzia"),
  art("Corriere della Sera", "Pensioni, via libera in commissione all'emendamento della manovra", "Coinvolti fino a 50 mila lavoratori"),
  art("Il Post", "Cosa cambia con l'emendamento sulle pensioni nella manovra"),
  art("la Repubblica", "Sciopero nazionale dei treni venerdì, le fasce garantite"),
  art("AGI", "Terremoto in Giappone, sarebbero almeno 12 le vittime", "Secondo fonti locali il bilancio è provvisorio", "agenzia"),
  art("Rai News", "Forte terremoto in Giappone: le vittime salgono", "Il bilancio provvisorio parla di 15 vittime", "servizio-pubblico"),
];

test("raggruppa gli articoli sullo stesso fatto", () => {
  const groups = clusterArticles(articles).map((c) => c.map((a) => a.sourceName).sort());
  assert.deepEqual(
    groups.sort((a, b) => b.length - a.length),
    [["ANSA", "Corriere della Sera", "Il Post"], ["AGI", "Rai News"], ["la Repubblica"]],
  );
});

test("valuta l'attendibilità dal numero di testate e dalle cifre", () => {
  const [pensioni, terremoto, sciopero] = summarizeLocally(articles, 5);
  assert.equal(pensioni.article_ids.length, 3);
  assert.equal(pensioni.reliability, "parziale", "30 mila contro 50 mila lavoratori");
  assert.deepEqual(
    pensioni.discrepancies[0].versions.map((v) => v.claim).sort(),
    ["30 mila lavoratori", "50 mila lavoratori"],
  );
  assert.equal(terremoto.reliability, "parziale", "12 contro 15 vittime");
  assert.ok(terremoto.caveats.some((c) => c.includes("condizionale")));
  assert.ok(terremoto.caveats.some((c) => c.includes("stime")));
  assert.equal(sciopero.reliability, "fonte_unica");
  assert.equal(sciopero.importance, "bassa");
  assert.match(sciopero.reliability_note, /solo la Repubblica/);
});

test("trova nomi e sigle da spiegare, escludendo parole comuni", () => {
  const terms = candidateTerms([
    art("ANSA", "La Banca centrale europea alza i tassi, Lagarde: «Inflazione ancora alta»", "Il Consiglio direttivo della Bce ha deciso. La Bce ..."),
  ]);
  assert.ok(terms.includes("Banca"), terms.join(", ")); // "La Banca centrale" → il nome proprio inizia con maiuscola
  assert.ok(terms.includes("Lagarde"));
  assert.ok(terms.includes("Bce"));
  assert.ok(!terms.includes("La"));
});

test("legge la voce di Wikipedia e scarta le disambigue", async () => {
  const reply = (title: string, extract: string) => async () => ({ query: { pages: { "1": { title, extract, fullurl: `https://it.wikipedia.org/wiki/${title}` } } } });
  const ok = await lookupTerm("Bce", reply("Banca centrale europea", "La Banca centrale europea (BCE) è la banca centrale dell'Unione europea."));
  assert.equal(ok, null, "nessuna parola in comune col termine");
  const lagarde = await lookupTerm("Lagarde", reply("Christine Lagarde", "Christine Lagarde è un'avvocata e politica francese."));
  assert.equal(lagarde?.page, "Christine Lagarde");
  assert.equal(await lookupTerm("Mercurio", reply("Mercurio", "Mercurio può riferirsi a: …")), null);
});
