import { z } from "zod";
import type { Article } from "./feeds.ts";
import type { CategoryId } from "./sources.ts";

const GlossaryEntry = z.object({
  term: z.string().describe("Termine, sigla, istituzione o persona come compare nella notizia"),
  explanation: z.string().describe("Spiegazione semplice in 1-2 frasi, per chi non ha contesto"),
});

export const RELIABILITY = ["confermata", "parziale", "fonte_unica", "contrastante"] as const;
export type Reliability = (typeof RELIABILITY)[number];

export const StorySchema = z.object({
  title: z.string().describe("Titolo neutro e informativo, senza enfasi"),
  summary: z.string().describe("Riassunto in 2-4 frasi dei fatti riportati dalle fonti"),
  key_points: z.array(z.string()).describe("2-4 punti chiave brevi"),
  importance: z.enum(["alta", "media", "bassa"]).describe("Rilevanza della notizia per un lettore italiano"),
  article_ids: z.array(z.number()).describe("Gli id di TUTTI gli articoli forniti che parlano di questa notizia"),
  reliability: z.enum(RELIABILITY),
  reliability_note: z
    .string()
    .describe("1-2 frasi: quante e quali fonti indipendenti la riportano, di che tipo, se concordano"),
  discrepancies: z
    .array(
      z.object({
        point: z.string().describe("Su cosa le fonti non concordano"),
        versions: z.array(
          z.object({
            article_ids: z.array(z.number()),
            claim: z.string().describe("Cosa riportano questi articoli"),
          }),
        ),
      }),
    )
    .describe("Differenze tra le fonti su fatti, cifre o interpretazioni; lista vuota se concordano"),
  caveats: z
    .array(z.string())
    .describe("Cautele: dichiarazioni di parte, accuse non provate, dati provvisori, titoli più forti dei fatti; lista vuota se nessuna"),
  glossary: z.array(GlossaryEntry).describe("Termini poco chiari per chi non segue l'argomento; lista vuota se nessuno"),
});

export type Story = z.infer<typeof StorySchema>;

export const CategorySummarySchema = z.object({
  stories: z.array(StorySchema).describe("Le notizie del giorno, dalla più rilevante"),
});

export const ExplanationSchema = z.object({
  background: z.string().describe("Il contesto: cosa è successo prima, chi sono gli attori, come si è arrivati a oggi"),
  why_it_matters: z.string().describe("Perché questa notizia è importante, in parole semplici"),
  implications: z
    .array(z.string())
    .describe("Possibili conseguenze concrete (per chi, in che modo), presentate come possibilità e non certezze"),
  glossary: z.array(GlossaryEntry).describe("Termini, sigle e nomi da spiegare"),
  open_questions: z.array(z.string()).describe("Cosa non è ancora chiaro o cosa tenere d'occhio nei prossimi giorni"),
});

export type Explanation = z.infer<typeof ExplanationSchema>;

export const AnswerSchema = z.object({
  answer: z.string().describe("Risposta diretta e semplice alla domanda, in poche frasi"),
});

/** Le notizie di una categoria, con gli articoli citati (per mostrare e linkare le fonti). */
export interface CategoryDigest {
  category: CategoryId;
  generatedAt: number;
  stories: Story[];
  articles: Article[];
  failedSources: string[];
  /** Quanti articoli sono stati letti e confrontati. */
  articleCount: number;
}

export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", hint: "Massima qualità" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", hint: "Più veloce ed economico" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export const DEFAULT_MODEL: ModelId = "claude-opus-5-5";

export function isModel(value: unknown): value is ModelId {
  return MODELS.some((m) => m.id === value);
}

export interface DigestOptions {
  model: ModelId;
  /** Numero massimo di notizie da produrre per la categoria. */
  maxStories: number;
}

export interface ExplainRequest {
  story: Story;
  articles: Article[];
  model: ModelId;
}

export interface AskRequest extends ExplainRequest {
  question: string;
  /** Domande e risposte precedenti sulla stessa notizia, per le domande di seguito. */
  history?: { question: string; answer: string }[];
}
