import { useState } from "react";
import { ArrowLeft, AudioLines, Check, ExternalLink, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { loadSettings, saveSettings, type DeviceSettings } from "../lib/settings.ts";
import { TRANSCRIPTION_PRESETS, type TranscriptionProvider } from "../../shared/transcription.ts";

const KEY_PAGES: Record<TranscriptionProvider, string> = {
  openai: "https://platform.openai.com/api-keys",
  groq: "https://console.groq.com/keys",
};

/** Impostazioni dell'app Android: le chiavi API restano solo su questo telefono. */
export function Settings({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<DeviceSettings>(loadSettings);
  const set = (p: Partial<DeviceSettings>) => setS((prev) => ({ ...prev, ...p }));

  return (
    <div className="settings">
      <header className="topbar">
        <button className="icon-btn" onClick={onClose} aria-label="Indietro">
          <ArrowLeft size={20} />
        </button>
        <h1 className="topbar-title">Impostazioni</h1>
      </header>

      <section className="card settings-card">
        <h2>
          <span className="box-icon ic-violet">
            <Sparkles size={17} />
          </span>
          AI per organizzare gli appunti
        </h2>
        <label className="field">
          Chiave API Claude
          <input
            type="password"
            autoComplete="off"
            placeholder="sk-ant-…"
            value={s.claudeKey}
            onChange={(e) => set({ claudeKey: e.target.value.trim() })}
          />
        </label>
        <a className="link" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          Crea una chiave su console.anthropic.com <ExternalLink size={14} />
        </a>
      </section>

      <section className="card settings-card">
        <h2>
          <span className="box-icon ic-red">
            <AudioLines size={17} />
          </span>
          Trascrizione di registrazioni e file
        </h2>
        <p className="hint">Facoltativa: senza questa chiave puoi comunque usare «Detta».</p>
        <div className="mode-cards" role="radiogroup" aria-label="Servizio">
          {(Object.keys(TRANSCRIPTION_PRESETS) as TranscriptionProvider[]).map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={s.transcriptionProvider === p}
              className={`mode-card ${s.transcriptionProvider === p ? "active" : ""}`}
              onClick={() => set({ transcriptionProvider: p })}
            >
              <strong>{TRANSCRIPTION_PRESETS[p].label}</strong>
              <span>{TRANSCRIPTION_PRESETS[p].model}</span>
            </button>
          ))}
        </div>
        <label className="field">
          Chiave API {TRANSCRIPTION_PRESETS[s.transcriptionProvider].label}
          <input
            type="password"
            autoComplete="off"
            placeholder="Incolla la chiave"
            value={s.transcriptionKey}
            onChange={(e) => set({ transcriptionKey: e.target.value.trim() })}
          />
        </label>
        <a className="link" href={KEY_PAGES[s.transcriptionProvider]} target="_blank" rel="noreferrer">
          Crea una chiave {TRANSCRIPTION_PRESETS[s.transcriptionProvider].label} <ExternalLink size={14} />
        </a>
      </section>

      <p className="hint privacy">
        <ShieldCheck size={16} /> Le chiavi restano salvate solo su questo telefono e vengono inviate unicamente ai servizi indicati.
      </p>

      <button
        className="btn-primary"
        style={{ width: "100%" }}
        onClick={() => {
          saveSettings(s);
          onClose();
        }}
      >
        <Check size={20} /> Salva
      </button>
      <p className="hint" style={{ textAlign: "center", marginTop: 14 }}>
        <KeyRound size={14} style={{ verticalAlign: -2 }} /> I costi d'uso dipendono dal tuo account presso ciascun servizio.
      </p>
    </div>
  );
}
