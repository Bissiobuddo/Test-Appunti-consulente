export interface TranscriptionService {
  url: string;
  apiKey: string;
  model: string;
}

export const TRANSCRIPTION_PRESETS = {
  openai: { url: "https://api.openai.com/v1/audio/transcriptions", model: "whisper-1", label: "OpenAI" },
  groq: { url: "https://api.groq.com/openai/v1/audio/transcriptions", model: "whisper-large-v3", label: "Groq" },
} as const;

export type TranscriptionProvider = keyof typeof TRANSCRIPTION_PRESETS;

/** Invia l'audio a un endpoint compatibile Whisper (/audio/transcriptions). Funziona su Node e nel browser. */
export async function transcribeWith(service: TranscriptionService, audio: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", service.model);
  form.append("language", "it");
  form.append("response_format", "json");

  const res = await fetch(service.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${service.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Trascrizione non riuscita (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text?.trim() ?? "";
}
