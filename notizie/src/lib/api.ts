import { CapacitorHttp } from "@capacitor/core";
import type Anthropic from "@anthropic-ai/sdk";
import { isNative } from "./platform.ts";
import { loadSettings, type AppSettings } from "./settings.ts";
import type { CategoryId } from "../../shared/sources.ts";
import type { Article } from "../../shared/feeds.ts";
import type { CategoryDigest, Engine, Explanation, Story } from "../../shared/schema.ts";
import type { WikiTerm } from "../../shared/wikipedia.ts";

export interface ServerConfig {
  authRequired: boolean;
  aiAvailable: boolean;
}

const PW_KEY = "notizie-password";

export function getPassword(): string {
  try {
    return localStorage.getItem(PW_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPassword(pw: string) {
  try {
    localStorage.setItem(PW_KEY, pw);
  } catch {
    // archiviazione non disponibile: la password vale solo per questa sessione
  }
  sessionPassword = pw;
}

let sessionPassword = getPassword();

async function request<T>(url: string, body?: unknown): Promise<T> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (sessionPassword) headers.set("x-app-password", sessionPassword);
  const res = await fetch(url, body === undefined ? { headers } : { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
  return data as T;
}

/** Nell'app Android la "configurazione" è la chiave inserita nelle impostazioni. */
export function fetchConfig(): Promise<ServerConfig> {
  if (isNative) return Promise.resolve({ authRequired: false, aiAvailable: Boolean(loadSettings().claudeKey) });
  return request<ServerConfig>("/api/config");
}

export const checkPassword = () => request<{ ok: true }>("/api/check", {});

/** Nell'app Android i feed si scaricano con l'HTTP nativo: i siti di notizie non permettono le richieste CORS. */
async function fetchTextNative(url: string): Promise<string> {
  const res = await CapacitorHttp.get({
    url,
    headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" },
    responseType: "text",
    connectTimeout: 12_000,
    readTimeout: 15_000,
  });
  if (res.status >= 400) throw new Error(`Feed ${res.status}`);
  return typeof res.data === "string" ? res.data : String(res.data ?? "");
}

/** Esegue una funzione di shared/digest.ts dal telefono, traducendo gli errori dell'SDK. */
async function native<T>(run: (mod: typeof import("../../shared/digest.ts"), client: Anthropic) => Promise<T>): Promise<T> {
  const [{ default: AnthropicClient }, mod] = await Promise.all([import("@anthropic-ai/sdk"), import("../../shared/digest.ts")]);
  const client = new AnthropicClient({ apiKey: loadSettings().claudeKey, dangerouslyAllowBrowser: true });
  try {
    return await run(mod, client);
  } catch (err) {
    if (err instanceof AnthropicClient.AuthenticationError) throw new Error("Chiave Claude non valida: controllala nelle impostazioni.");
    if (err instanceof AnthropicClient.RateLimitError) throw new Error("Troppe richieste all'AI, riprova tra poco.");
    if (err instanceof AnthropicClient.APIConnectionError) throw new Error("Nessuna connessione a internet.");
    throw err;
  }
}

export async function loadCategory(category: CategoryId, s: AppSettings, engine: Engine): Promise<CategoryDigest> {
  const selection = { disabledSources: s.disabledSources, customFeeds: s.customFeeds };
  const options = { model: s.model, maxStories: s.maxStories };
  if (isNative && engine === "locale") {
    const { buildLocalDigest } = await import("../../shared/local.ts");
    return buildLocalDigest(category, selection, s.maxStories, fetchTextNative);
  }
  if (isNative) return native((m, client) => m.buildCategoryDigest(category, selection, options, fetchTextNative, client));
  return request<CategoryDigest>("/api/digest", { category, ...selection, ...options, engine });
}

/** Spiegazioni senza AI: nomi e sigle della notizia cercati su Wikipedia (che permette le richieste dal browser). */
export async function explainWithWikipedia(articles: Article[]): Promise<WikiTerm[]> {
  const { explainWithWikipedia: run } = await import("../../shared/wikipedia.ts");
  return run(articles, async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
    return res.json();
  });
}

export function explain(story: Story, articles: Article[], s: AppSettings): Promise<Explanation> {
  if (isNative) return native((m, client) => m.explainStory({ story, articles, model: s.model }, client));
  return request<Explanation>("/api/explain", { story, articles, model: s.model });
}

export async function ask(
  story: Story,
  articles: Article[],
  question: string,
  history: { question: string; answer: string }[],
  s: AppSettings,
): Promise<string> {
  const req = { story, articles, question, history, model: s.model };
  if (isNative) return native((m, client) => m.answerQuestion(req, client));
  return (await request<{ answer: string }>("/api/ask", req)).answer;
}
