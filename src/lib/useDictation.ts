import { useCallback, useEffect, useRef, useState } from "react";
import { SpeechRecognition as NativeSpeech } from "@capacitor-community/speech-recognition";
import { isNative } from "./platform.ts";
import { keepAwake, releaseAwake } from "./wakeLock.ts";

// Tipi minimi della Web Speech API (non inclusi in lib.dom di TypeScript).
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

const Ctor: RecognitionCtor | undefined =
  (window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;

export const dictationSupported = isNative || Boolean(Ctor);

// Errori del riconoscimento nativo Android dopo i quali non ha senso riprovare.
const NATIVE_FATAL: Record<string, string> = {
  "Insufficient permissions": "Permesso microfono negato. Abilitalo nelle impostazioni di Android.",
  "Network error": "Il riconoscimento vocale richiede la connessione a internet.",
  "Network timeout": "Il riconoscimento vocale richiede la connessione a internet.",
};

const ERRORS: Record<string, string> = {
  "not-allowed": "Permesso microfono negato. Abilitalo nelle impostazioni del browser.",
  "service-not-allowed": "Riconoscimento vocale non consentito su questo dispositivo.",
  "audio-capture": "Nessun microfono disponibile.",
  network: "Il riconoscimento vocale richiede la connessione a internet.",
};

/**
 * Dettatura continua con la Web Speech API. Su Android il riconoscimento si
 * interrompe dopo qualche secondo di silenzio: qui viene riavviato finché
 * l'utente non preme Stop, così si può parlare liberamente alla guida.
 * Usa il microfono attivo di sistema (anche cuffie/auto via Bluetooth).
 */
export function useDictation(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const wantRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => {
    wantRef.current = false;
    if (isNative) void NativeSpeech.stop().catch(() => {});
    recRef.current?.stop();
    setListening(false);
    setInterim("");
    void releaseAwake();
  }, []);

  /**
   * Android: il riconoscitore di sistema restituisce una frase alla volta e si
   * ferma a ogni pausa; lo si riavvia in ciclo finché l'utente non preme Stop.
   */
  const startNative = useCallback(async () => {
    setError(null);
    const { speechRecognition } = await NativeSpeech.requestPermissions();
    if (speechRecognition !== "granted") {
      setError(NATIVE_FATAL["Insufficient permissions"]);
      return;
    }
    wantRef.current = true;
    setListening(true);
    void keepAwake();
    let failures = 0;
    while (wantRef.current) {
      try {
        const { matches } = await NativeSpeech.start({ language: "it-IT", maxResults: 1, partialResults: false, popup: false });
        const text = matches?.[0]?.trim();
        if (text && wantRef.current) onFinalRef.current(text);
        failures = 0;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg in NATIVE_FATAL) {
          setError(NATIVE_FATAL[msg]);
          break;
        }
        // "No match", "No speech input": silenzio, si riprende ad ascoltare.
        // Altri errori ripetuti di fila (microfono occupato…) fermano la dettatura.
        if (msg !== "No match" && msg !== "No speech input" && ++failures >= 5) {
          if (wantRef.current) setError(`Riconoscimento vocale non disponibile (${msg}). Prova «Registra».`);
          break;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    wantRef.current = false;
    setListening(false);
    void releaseAwake();
  }, []);

  const start = useCallback(() => {
    if (isNative) {
      void startNative();
      return;
    }
    if (!Ctor) {
      setError("Dettatura non supportata da questo browser: usa Chrome (Android/desktop) oppure la registrazione audio.");
      return;
    }
    setError(null);
    wantRef.current = true;
    const rec = new Ctor();
    rec.lang = "it-IT";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) onFinalRef.current(r[0].transcript.trim());
        else partial += r[0].transcript;
      }
      setInterim(partial);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      setError(ERRORS[e.error] ?? `Errore riconoscimento: ${e.error}`);
      if (e.error in ERRORS) wantRef.current = false;
    };
    rec.onend = () => {
      if (wantRef.current) {
        try {
          rec.start();
          return;
        } catch {
          // impossibile riavviare: si ferma
        }
      }
      setListening(false);
      setInterim("");
      void releaseAwake();
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
    void keepAwake();
  }, [startNative]);

  useEffect(() => stop, [stop]);

  return { listening, interim, error, start, stop };
}
