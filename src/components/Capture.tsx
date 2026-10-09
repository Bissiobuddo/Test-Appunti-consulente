import { useEffect, useRef, useState } from "react";
import { Circle, Headphones, LoaderCircle, Mic, Pause, Play, Square, TriangleAlert, Upload } from "lucide-react";
import { dictationSupported, useDictation } from "../lib/useDictation.ts";
import { extensionFor, listMicrophones, useRecorder } from "../lib/useRecorder.ts";
import { transcribe } from "../lib/api.ts";

interface Props {
  transcriptionAvailable: boolean;
  /** Aggiunge testo alla trascrizione corrente. */
  onText: (text: string) => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Pulsanti grandi per dettare, registrare o caricare audio: pensati per l'uso in auto. */
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
  const disabledReason = (ok: boolean, why: string) => (ok ? undefined : why);

  return (
    <section className="capture card">
      <div className="capture-buttons">
        {!recorder.recording && (
          <button
            className={`capture-tile dict ${dictation.listening ? "live" : ""}`}
            onClick={dictation.listening ? dictation.stop : dictation.start}
            disabled={!dictationSupported || Boolean(busy)}
            title={disabledReason(dictationSupported, "Dettatura non supportata da questo browser")}
            aria-pressed={dictation.listening}
          >
            <span className="tile-icon">{dictation.listening ? <Square size={24} fill="currentColor" /> : <Mic size={28} />}</span>
            {dictation.listening ? "Tocca per fermare" : "Detta"}
            {!dictation.listening && <small>Testo dal vivo</small>}
          </button>
        )}
        {!dictation.listening && (
          <button
            className={`capture-tile rec ${recorder.recording ? "live" : ""}`}
            onClick={recorder.recording ? stopRecording : () => recorder.start(micId || undefined)}
            disabled={!transcriptionAvailable || Boolean(busy)}
            title={disabledReason(transcriptionAvailable, "Trascrizione file non configurata sul server")}
            aria-pressed={recorder.recording}
          >
            <span className="tile-icon">
              {recorder.recording ? <Square size={24} fill="currentColor" /> : <Circle size={26} fill="currentColor" />}
            </span>
            {recorder.recording ? `Stop · ${fmt(recorder.seconds)}` : "Registra"}
            {!recorder.recording && <small>Trascrive alla fine</small>}
          </button>
        )}
      </div>

      {active && (
        <div className={`wave ${recorder.recording ? "rec" : ""} ${recorder.paused ? "paused" : ""}`} aria-hidden>
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      )}
      {dictation.listening && (
        <p className="interim" aria-live="polite">
          {dictation.interim || "In ascolto… parla pure, riprende da solo dopo le pause"}
        </p>
      )}
      {recorder.recording && (
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="chip" onClick={recorder.togglePause}>
            {recorder.paused ? <Play size={18} /> : <Pause size={18} />}
            {recorder.paused ? "Riprendi" : "Pausa"}
          </button>
        </div>
      )}

      {!active && (
        <div className="capture-extra">
          <button className="chip" onClick={() => fileRef.current?.click()} disabled={!transcriptionAvailable || Boolean(busy)}>
            <Upload size={18} /> Carica audio
          </button>
          {transcriptionAvailable && mics.length > 1 && (
            <label className="select-wrap">
              <Headphones size={16} aria-hidden />
              <span className="sr-only">Microfono</span>
              <select value={micId} onChange={(e) => setMicId(e.target.value)} aria-label="Microfono">
                <option value="">Microfono predefinito</option>
                {mics.map((m, i) => (
                  <option key={m.deviceId} value={m.deviceId}>
                    {m.label || `Microfono ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
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

      {busy && (
        <p className="msg status">
          <LoaderCircle size={18} className="spin" /> {busy}
        </p>
      )}
      {shownError && (
        <p className="msg error">
          <TriangleAlert size={18} /> {shownError}
        </p>
      )}
    </section>
  );
}
