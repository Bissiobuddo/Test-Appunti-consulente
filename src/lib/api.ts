import type { OrganizedNote, OrganizeMode } from "./types.ts";
import { isNative } from "./platform.ts";
import { CapacitorHttp } from "@capacitor/core";
import { loadSettings, transcriptionService } from "./settings.ts";
import { blobToBase64 } from "./base64.ts";

export interface ServerConfig {
  authRequired: boolean;
  aiAvailable: boolean;
  transcriptionAvailable: boolean;
}

const PW_KEY = "appunti-password";

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

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (sessionPassword) headers.set("x-app-password", sessionPassword);
  const res = await fetch(url, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
  return data as T;
}

/** Nell'app Android la "configurazione" sono le chiavi inserite nelle impostazioni. */
export function fetchConfig(): Promise<ServerConfig> {
  if (isNative) {
    const s = loadSettings();
    return Promise.resolve({ authRequired: false, aiAvailable: Boolean(s.claudeKey), transcriptionAvailable: Boolean(s.transcriptionKey) });
  }
  return request<ServerConfig>("/api/config");
}

export const checkPassword = () => request<{ ok: true }>("/api/check", { method: "POST" });

export async function transcribe(audio: Blob, filename: string): Promise<string> {
  if (isNative) return transcribeNative(audio, filename);
  const form = new FormData();
  form.append("audio", audio, filename);
  const { text } = await request<{ text: string }>("/api/transcribe", { method: "POST", body: form });
  return text;
}

export async function organize(transcript: string, mode: OrganizeMode, instructions?: string): Promise<OrganizedNote> {
  if (isNative) {
    const [{ default: Anthropic }, { organizeNote }] = await Promise.all([
      import("@anthropic-ai/sdk"),
      import("../../shared/organize.ts"),
    ]);
    const client = new Anthropic({ apiKey: loadSettings().claudeKey, dangerouslyAllowBrowser: true });
    try {
      return await organizeNote({ transcript, mode, instructions }, client);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new Error("Chiave Claude non valida: controllala nelle impostazioni.");
      if (err instanceof Anthropic.RateLimitError) throw new Error("Troppe richieste all'AI, riprova tra poco.");
      if (err instanceof Anthropic.APIConnectionError) throw new Error("Nessuna connessione a internet.");
      throw err;
    }
  }
  return request<OrganizedNote>("/api/organize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, mode, instructions }),
  });
}

/**
 * Nell'app Android l'audio parte dall'HTTP nativo di Capacitor: non è soggetto
 * alle regole CORS del browser, che alcuni servizi di trascrizione non consentono.
 */
async function transcribeNative(audio: Blob, filename: string): Promise<string> {
  const service = transcriptionService(loadSettings());
  const res = await CapacitorHttp.request({
    url: service.url,
    method: "POST",
    headers: { Authorization: `Bearer ${service.apiKey}`, "Content-Type": "multipart/form-data" },
    dataType: "formData",
    data: [
      { key: "file", type: "base64File", value: await blobToBase64(audio), fileName: filename, contentType: audio.type || "audio/webm" },
      { key: "model", type: "string", value: service.model },
      { key: "language", type: "string", value: "it" },
      { key: "response_format", type: "string", value: "json" },
    ],
    connectTimeout: 30_000,
    readTimeout: 300_000,
  });
  let data = res.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = { error: { message: data.slice(0, 200) } };
    }
  }
  if (res.status === 401) throw new Error("Chiave di trascrizione non valida: controllala nelle impostazioni.");
  if (res.status >= 400) throw new Error(`Trascrizione non riuscita (${res.status}): ${data?.error?.message ?? ""}`);
  return String(data?.text ?? "").trim();
}
