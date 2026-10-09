const url = process.env.TRANSCRIPTION_API_URL || "https://api.openai.com/v1/audio/transcriptions";
const model = process.env.TRANSCRIPTION_MODEL || "whisper-1";

export const transcriptionAvailable = () => Boolean(process.env.TRANSCRIPTION_API_KEY);

/** Invia l'audio a un endpoint compatibile Whisper (/audio/transcriptions). */
export async function transcribeAudio(audio: Buffer, filename: string, mimeType: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), filename);
  form.append("model", model);
  form.append("language", "it");
  form.append("response_format", "json");

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TRANSCRIPTION_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Trascrizione non riuscita (${res.status}): ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { text?: string };
  return data.text?.trim() ?? "";
}
