import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { answerQuestion, buildCategoryDigest, explainStory, RefusalError, type SourceSelection } from "../shared/digest.ts";
import { isCategory, type CustomFeed } from "../shared/sources.ts";
import { DEFAULT_MODEL, isModel, type AskRequest, type CategoryDigest } from "../shared/schema.ts";
import { fetchFeed } from "./fetchFeed.ts";
import { buildLocalDigest } from "../shared/local.ts";

try {
  process.loadEnvFile();
} catch {
  // nessun file .env: si usano le variabili d'ambiente già impostate
}

const app = express();
const password = process.env.APP_PASSWORD;

app.use(express.json({ limit: "2mb" }));

app.get("/api/config", (_req, res) => {
  res.json({
    authRequired: Boolean(password),
    aiAvailable: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  });
});

app.use("/api", (req, res, next) => {
  if (password && req.get("x-app-password") !== password) {
    res.status(401).json({ error: "Password non valida" });
    return;
  }
  next();
});

app.post("/api/check", (_req, res) => {
  res.json({ ok: true });
});

// Le stesse notizie richieste più volte a breve distanza (più dispositivi, ricarica) non rifanno la sintesi.
const CACHE_MS = 20 * 60_000;
const cache = new Map<string, Promise<CategoryDigest>>();

app.post("/api/digest", async (req, res, next) => {
  try {
    const body = req.body as {
      category?: unknown;
      model?: unknown;
      maxStories?: unknown;
      disabledSources?: unknown;
      customFeeds?: unknown;
      engine?: unknown;
      force?: boolean;
    };
    if (!isCategory(body.category)) {
      res.status(400).json({ error: "Categoria non valida" });
      return;
    }
    const selection: SourceSelection = {
      disabledSources: Array.isArray(body.disabledSources) ? body.disabledSources.filter((s) => typeof s === "string") : [],
      customFeeds: Array.isArray(body.customFeeds)
        ? (body.customFeeds as CustomFeed[]).filter((f) => f && typeof f.url === "string" && typeof f.name === "string" && isCategory(f.category)).slice(0, 30)
        : [],
    };
    const options = {
      model: isModel(body.model) ? body.model : DEFAULT_MODEL,
      maxStories: Math.min(Math.max(Number(body.maxStories) || 8, 3), 15),
    };

    // Senza AI non serve la chiave: il server legge solo i feed (il browser non può, per i vincoli CORS).
    const local = body.engine === "locale";
    const key = JSON.stringify([body.category, local ? "locale" : options, selection]);
    let pending = cache.get(key);
    if (!pending || body.force) {
      pending = local
        ? buildLocalDigest(body.category, selection, options.maxStories, fetchFeed)
        : buildCategoryDigest(body.category, selection, options, fetchFeed);
      cache.set(key, pending);
      pending.then(
        () => setTimeout(() => cache.get(key) === pending && cache.delete(key), CACHE_MS),
        () => cache.get(key) === pending && cache.delete(key),
      );
    }
    res.json(await pending);
  } catch (err) {
    next(err);
  }
});

app.post("/api/explain", async (req, res, next) => {
  try {
    const body = req.body as Partial<AskRequest>;
    if (!body.story?.title || !Array.isArray(body.articles)) {
      res.status(400).json({ error: "Notizia mancante" });
      return;
    }
    res.json(await explainStory({ story: body.story, articles: body.articles, model: isModel(body.model) ? body.model : DEFAULT_MODEL }));
  } catch (err) {
    next(err);
  }
});

app.post("/api/ask", async (req, res, next) => {
  try {
    const body = req.body as Partial<AskRequest>;
    if (!body.story?.title || !Array.isArray(body.articles) || typeof body.question !== "string" || !body.question.trim()) {
      res.status(400).json({ error: "Domanda mancante" });
      return;
    }
    const answer = await answerQuestion({
      story: body.story,
      articles: body.articles,
      question: body.question.slice(0, 1000),
      history: Array.isArray(body.history) ? body.history.slice(-6) : [],
      model: isModel(body.model) ? body.model : DEFAULT_MODEL,
    });
    res.json({ answer });
  } catch (err) {
    next(err);
  }
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (err instanceof RefusalError) {
    res.status(422).json({ error: err.message });
  } else if (err instanceof Anthropic.AuthenticationError) {
    res.status(500).json({ error: "Chiave API Anthropic non valida o mancante sul server." });
  } else if (err instanceof Anthropic.RateLimitError) {
    res.status(429).json({ error: "Troppe richieste all'AI, riprova tra poco." });
  } else if (err instanceof Anthropic.APIError) {
    res.status(502).json({ error: `Errore AI (${err.status}): ${err.message}` });
  } else {
    res.status(500).json({ error: err instanceof Error ? err.message : "Errore interno" });
  }
});

if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
  app.use(express.static(dist));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Server in ascolto su http://localhost:${port}`));
