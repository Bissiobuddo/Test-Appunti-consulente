import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { organizeNote, RefusalError } from "./ai.ts";
import { transcribeAudio, transcriptionAvailable } from "./transcribe.ts";
import type { OrganizeRequest } from "../shared/schema.ts";

try {
  process.loadEnvFile();
} catch {
  // nessun file .env: si usano le variabili d'ambiente già impostate
}

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const password = process.env.APP_PASSWORD;

app.use(express.json({ limit: "2mb" }));

app.get("/api/config", (_req, res) => {
  res.json({
    authRequired: Boolean(password),
    aiAvailable: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    transcriptionAvailable: transcriptionAvailable(),
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

app.post("/api/transcribe", upload.single("audio"), async (req, res, next) => {
  try {
    if (!transcriptionAvailable()) {
      res.status(501).json({ error: "Trascrizione di file non configurata sul server (TRANSCRIPTION_API_KEY)." });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "Nessun file audio ricevuto" });
      return;
    }
    const text = await transcribeAudio(req.file.buffer, req.file.originalname || "audio.webm", req.file.mimetype);
    res.json({ text });
  } catch (err) {
    next(err);
  }
});

app.post("/api/organize", async (req, res, next) => {
  try {
    const body = req.body as Partial<OrganizeRequest>;
    if (!body.transcript?.trim()) {
      res.status(400).json({ error: "Trascrizione vuota" });
      return;
    }
    const note = await organizeNote({
      transcript: body.transcript,
      mode: body.mode === "amplia" ? "amplia" : "fedele",
      instructions: body.instructions,
    });
    res.json(note);
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
  } else if (err instanceof multer.MulterError) {
    res.status(400).json({ error: `Upload non valido: ${err.message}` });
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
