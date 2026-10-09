import { transcribeWith, TRANSCRIPTION_PRESETS } from "../shared/transcription.ts";

export const transcriptionAvailable = () => Boolean(process.env.TRANSCRIPTION_API_KEY);

export function transcribeAudio(audio: Buffer, filename: string, mimeType: string): Promise<string> {
  return transcribeWith(
    {
      url: process.env.TRANSCRIPTION_API_URL || TRANSCRIPTION_PRESETS.openai.url,
      model: process.env.TRANSCRIPTION_MODEL || TRANSCRIPTION_PRESETS.openai.model,
      apiKey: process.env.TRANSCRIPTION_API_KEY ?? "",
    },
    new Blob([new Uint8Array(audio)], { type: mimeType }),
    filename,
  );
}
