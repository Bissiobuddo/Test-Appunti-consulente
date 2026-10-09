import type { OrganizedNote, OrganizeMode } from "./types.ts";

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

export const fetchConfig = () => request<ServerConfig>("/api/config");

export const checkPassword = () => request<{ ok: true }>("/api/check", { method: "POST" });

export async function transcribe(audio: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("audio", audio, filename);
  const { text } = await request<{ text: string }>("/api/transcribe", { method: "POST", body: form });
  return text;
}

export const organize = (transcript: string, mode: OrganizeMode, instructions?: string) =>
  request<OrganizedNote>("/api/organize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, mode, instructions }),
  });
