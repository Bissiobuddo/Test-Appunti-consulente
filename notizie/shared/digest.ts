import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { fetchArticles, type FetchText } from "./feeds.ts";
import { DIGEST_SYSTEM, EXPLAIN_SYSTEM, askUserMessage, digestUserMessage, explainUserMessage } from "./prompt.ts";
import { feedsFor, type CategoryId, type CustomFeed } from "./sources.ts";
import {
  AnswerSchema,
  CategorySummarySchema,
  ExplanationSchema,
  type AskRequest,
  type CategoryDigest,
  type DigestOptions,
  type ExplainRequest,
  type Explanation,
} from "./schema.ts";

export class RefusalError extends Error {}

export interface SourceSelection {
  disabledSources?: string[];
  customFeeds?: CustomFeed[];
}

async function ask<T>(
  client: Anthropic,
  model: string,
  system: string,
  content: string,
  format: Parameters<typeof betaZodOutputFormat>[0],
): Promise<T> {
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(format) },
    system,
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new RefusalError(response.stop_details?.explanation ?? "Richiesta rifiutata dal modello");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new Error("Risposta incompleta dall'AI: riprova o riduci il numero di notizie per categoria.");
  }
  return response.parsed_output as T;
}

/**
 * Legge i feed di una categoria e fa riassumere e confrontare le notizie a Claude.
 * Usata dal server e, nell'app Android, direttamente dal telefono con la chiave dell'utente.
 */
export async function buildCategoryDigest(
  category: CategoryId,
  selection: SourceSelection,
  options: DigestOptions,
  fetchText: FetchText,
  client: Anthropic = new Anthropic(),
): Promise<CategoryDigest> {
  const feeds = feedsFor(category, selection.disabledSources, selection.customFeeds);
  const { articles, failedSources } = await fetchArticles(feeds, fetchText);
  const generatedAt = Date.now();
  if (!articles.length) {
    if (failedSources.length) throw new Error("Nessuna fonte raggiungibile per questa categoria. Controlla la connessione.");
    return { category, generatedAt, stories: [], articles: [], failedSources, articleCount: 0 };
  }

  const { stories } = await ask<{ stories: CategoryDigest["stories"] }>(
    client,
    options.model,
    DIGEST_SYSTEM,
    digestUserMessage(category, articles, options.maxStories, generatedAt),
    CategorySummarySchema,
  );

  // Tiene solo gli id che esistono davvero, così ogni fonte citata ha un link verificabile.
  const byId = new Map(articles.map((a) => [a.id, a]));
  const valid = (ids: number[]) => [...new Set(ids)].filter((id) => byId.has(id));
  const cleaned = stories
    .map((s) => ({
      ...s,
      article_ids: valid(s.article_ids),
      discrepancies: s.discrepancies.map((d) => ({ ...d, versions: d.versions.map((v) => ({ ...v, article_ids: valid(v.article_ids) })) })),
    }))
    .filter((s) => s.article_ids.length > 0)
    .slice(0, options.maxStories);
  const cited = new Set(cleaned.flatMap((s) => s.article_ids));

  return {
    category,
    generatedAt,
    stories: cleaned,
    articles: articles.filter((a) => cited.has(a.id)),
    failedSources,
    articleCount: articles.length,
  };
}

/** Spiega contesto, termini e implicazioni di una notizia. */
export function explainStory(req: ExplainRequest, client: Anthropic = new Anthropic()): Promise<Explanation> {
  return ask<Explanation>(client, req.model, EXPLAIN_SYSTEM, explainUserMessage(req), ExplanationSchema);
}

/** Risponde a una domanda libera su una notizia. */
export async function answerQuestion(req: AskRequest, client: Anthropic = new Anthropic()): Promise<string> {
  const { answer } = await ask<{ answer: string }>(client, req.model, EXPLAIN_SYSTEM, askUserMessage(req), AnswerSchema);
  return answer;
}
