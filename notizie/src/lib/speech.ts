import { TextToSpeech } from "@capacitor-community/text-to-speech";
import { isNative } from "./platform.ts";

// Lettura ad alta voce: sintesi vocale di Android nell'app, Web Speech API nel browser.
export const speechSupported = isNative || "speechSynthesis" in window;

/**
 * Divide il testo in frasi brevi: alcuni browser interrompono le letture lunghe
 * e così "Indietro"/"Avanti" rispondono subito.
 */
export function chunkText(text: string, max = 220): string[] {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?;:]+[.!?;:]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > max && current) {
      chunks.push(current.trim());
      current = "";
    }
    current += s;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function italianVoice(): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("it"));
  return voices.find((v) => /google|natural|premium|enhanced/i.test(v.name)) ?? voices[0];
}

export type SpeakResult = "done" | "stopped" | "failed";

function speakWeb(text: string, rate: number): Promise<SpeakResult> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "it-IT";
    u.rate = rate;
    const voice = italianVoice();
    if (voice) u.voice = voice;
    u.onend = () => resolve("done");
    u.onerror = (e) => resolve(e.error === "interrupted" || e.error === "canceled" ? "stopped" : "failed");
    speechSynthesis.speak(u);
  });
}

let generation = 0;

/** Legge il testo; dice se è arrivata in fondo, è stata interrotta o la sintesi vocale non funziona. */
export async function speak(text: string, rate = 1): Promise<SpeakResult> {
  const mine = ++generation;
  for (const chunk of chunkText(text)) {
    if (mine !== generation) return "stopped";
    const result = isNative
      ? await TextToSpeech.speak({ text: chunk, lang: "it-IT", rate, category: "playback" }).then(
          () => "done" as const,
          () => "failed" as const,
        )
      : await speakWeb(chunk, rate);
    if (mine !== generation) return "stopped";
    if (result === "failed") return "failed";
  }
  return "done";
}

export const SPEECH_ERROR = "La sintesi vocale non risponde: controlla che sia installata una voce italiana (su Android: Impostazioni › Sintesi vocale).";

export async function stopSpeaking() {
  generation++;
  if (isNative) await TextToSpeech.stop().catch(() => {});
  else if (speechSupported) speechSynthesis.cancel();
}
