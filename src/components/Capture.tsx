import { useEffect, useRef, useState } from "react";
import { dictationSupported, useDictation } from "../lib/useDictation.ts";
import { extensionFor, listMicrophones, useRecorder } from "../lib/useRecorder.ts";
import { transcribe } from "../lib/api.ts";

interface Props {
  transcriptionAvailable: boolean;
  /** Aggiunge testo alla trascrizione corrente. */
  onText: (text: string) => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Pulsantoni per dettare, registrare o caricare audio: pensati per l'uso in auto. */
export function Capture({ transcriptionAvailable, onText }: Props) {
  const dictation = useDictation(onText);
  const recorder = useRecorder();
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refresh = () => void listMicrophones().then(setMics);
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
  }, [recorder.recording]);

  async function sendAudio(blob: Blob, name: string) {
    setBusy("Trascrizione in corso…");
    setError(null);
    try {
      const text = await transcribe(blob, name);
      if (text) onText(text);
      else setError("Nessun parlato riconosciuto nell'audio.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function stopRecording() {
    const blob = await recorder.stop();
    if (blob?.size) await sendAudio(blob, `registrazione.${extensionFor(blob.type)}`);
  }

  const active = dictation.listening || recorder.recording;
  const shownError = error ?? dictation.error ?? recorder.error;

  return (
    <section className="capture">
      <div className="capture-buttons">
        {!recorder.recording && (
          <button
            className={`big-btn ${dictation.listening ? "live" : ""}`}
            onClick={dictation.listening ? dictation.stop : dictation.start}
            disabled={!dictationSupported || Boolean(busy)}
            title={dictationSupported ? "" : "Non supportata da questo browser"}
          >
            <span className="big-icon">{dictation.listening ? "■" : "🎙️"}</span>
            {dictation.listening ? "Stop dettatura" : "Detta"}
          </button>
        )}
        {!dictation.listening && (
          <button
            className={`big-btn rec ${recorder.recording ? "live" : ""}`}
            onClick={recorder.recording ? stopRecording : () => recorder.start(micId || undefined)}
            disabled={!transcriptionAvailable || Boolean(busy)}
            title={transcriptionAvailable ? "" : "Trascrizione file non configurata sul server"}
          >
            <span className="big-icon">{recorder.recording ? "■" : "⏺"}</span>
            {recorder.recording ? `Stop ${fmt(recorder.seconds)}` : "Registra"}
          </button>
        )}
      </div>

      {dictation.listening && (
        <p className="interim" aria-live="polite">
          {dictation.interim || "In ascolto… parla pure, si riavvia da solo dopo le pause."}
        </p>
      )}
      {recorder.recording && (
        <button className="secondary" onClick={recorder.togglePause}>
          {recorder.paused ? "▶ Riprendi" : "⏸ Pausa"}
        </button>
      )}

      {!active && (
        <div className="capture-extra">
          {transcriptionAvailable && mics.length > 1 && (
            <label>
              Microfono{" "}
              <select value={micId} onChange={(e) => setMicId(e.target.value)}>
                <option value="">Predefinito di sistema</option>
                {mics.map((m, i) => (
                  <option key={m.deviceId} value={m.deviceId}>
                    {m.label || `Microfono ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="secondary" onClick={() => fileRef.current?.click()} disabled={!transcriptionAvailable || Boolean(busy)}>
            📁 Carica file audio
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,video/mp4,.m4a,.mp3,.wav,.ogg,.webm,.aac,.flac"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void sendAudio(f, f.name);
            }}
          />
        </div>
      )}

      {busy && <p className="status">{busy}</p>}
      {shownError && <p className="error">{shownError}</p>}
    </section>
  );
}
