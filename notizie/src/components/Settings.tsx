import { useState } from "react";
import { ArrowLeft, Check, ExternalLink, LayoutGrid, Newspaper, Plus, Rss, ShieldCheck, Sparkles, Trash2, Volume2 } from "lucide-react";
import { CATEGORIES, SOURCES, SOURCE_KIND_LABEL, type CategoryId } from "../../shared/sources.ts";
import { MODELS } from "../../shared/schema.ts";
import { isNative } from "../lib/platform.ts";
import { loadSettings, saveSettings, type AppSettings } from "../lib/settings.ts";
import { speak, speechSupported } from "../lib/speech.ts";

const STORY_COUNTS = [5, 8, 12];
const RATES = [0.9, 1, 1.15, 1.3];

export function Settings({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<AppSettings>(loadSettings);
  const set = (p: Partial<AppSettings>) => setS((prev) => ({ ...prev, ...p }));
  const [feed, setFeed] = useState({ name: "", url: "", category: "italia" as CategoryId });

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <div className="settings">
      <header className="topbar">
        <button className="icon-btn" onClick={onClose} aria-label="Indietro">
          <ArrowLeft size={20} />
        </button>
        <h1 className="topbar-title">Impostazioni</h1>
      </header>

      {isNative && (
        <section className="card settings-card">
          <h2>
            <span className="box-icon ic-violet">
              <Sparkles size={17} />
            </span>
            Chiave AI
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
      )}

      <section className="card settings-card">
        <h2>
          <span className="box-icon ic-blue">
            <Sparkles size={17} />
          </span>
          Modello AI
        </h2>
        <div className="mode-cards" role="radiogroup" aria-label="Modello">
          {MODELS.map((m) => (
            <button key={m.id} role="radio" aria-checked={s.model === m.id} className={`mode-card ${s.model === m.id ? "active" : ""}`} onClick={() => set({ model: m.id })}>
              <strong>{m.label}</strong>
              <span>{m.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="card settings-card">
        <h2>
          <span className="box-icon ic-teal">
            <LayoutGrid size={17} />
          </span>
          Categorie
        </h2>
        <p className="hint">Quelle da preparare quando aggiorni. Meno categorie = aggiornamento più rapido ed economico.</p>
        <div className="chips wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`chip ${s.categories.includes(c.id) ? "active" : ""}`}
              aria-pressed={s.categories.includes(c.id)}
              onClick={() => set({ categories: CATEGORIES.map((x) => x.id).filter((id) => (id === c.id ? !s.categories.includes(id) : s.categories.includes(id))) })}
            >
              {c.label}
            </button>
          ))}
        </div>
        <label className="field">
          Notizie per categoria
          <div className="seg">
            {STORY_COUNTS.map((n) => (
              <button key={n} className={s.maxStories === n ? "active" : ""} onClick={() => set({ maxStories: n })}>
                fino a {n}
              </button>
            ))}
          </div>
        </label>
      </section>

      <section className="card settings-card">
        <h2>
          <span className="box-icon ic-amber">
            <Newspaper size={17} />
          </span>
          Fonti da confrontare
        </h2>
        <ul className="source-toggles">
          {SOURCES.map((src) => (
            <li key={src.id}>
              <label>
                <input type="checkbox" checked={!s.disabledSources.includes(src.id)} onChange={() => set({ disabledSources: toggle(s.disabledSources, src.id) })} />
                <span>
                  {src.name}
                  <small>{SOURCE_KIND_LABEL[src.kind]}</small>
                </span>
              </label>
            </li>
          ))}
          {s.customFeeds.map((f, i) => (
            <li key={`${f.url}-${i}`}>
              <span className="custom-feed">
                <Rss size={16} />
                <span>
                  {f.name}
                  <small>
                    {CATEGORIES.find((c) => c.id === f.category)?.label} · {f.url}
                  </small>
                </span>
              </span>
              <button className="icon-btn danger" aria-label={`Rimuovi ${f.name}`} onClick={() => set({ customFeeds: s.customFeeds.filter((_, j) => j !== i) })}>
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
        <details className="add-feed">
          <summary>
            <Plus size={16} /> Aggiungi un feed RSS
          </summary>
          <label className="field">
            Nome della testata
            <input value={feed.name} onChange={(e) => setFeed({ ...feed, name: e.target.value })} placeholder="Es. Il Fatto Quotidiano" />
          </label>
          <label className="field">
            Indirizzo del feed (https://…)
            <input value={feed.url} onChange={(e) => setFeed({ ...feed, url: e.target.value.trim() })} placeholder="https://www.esempio.it/feed/" inputMode="url" />
          </label>
          <label className="field">
            Categoria
            <select value={feed.category} onChange={(e) => setFeed({ ...feed, category: e.target.value as CategoryId })}>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn-soft"
            disabled={!feed.name.trim() || !/^https:\/\/\S+$/i.test(feed.url)}
            onClick={() => {
              set({ customFeeds: [...s.customFeeds, { ...feed, name: feed.name.trim() }] });
              setFeed({ ...feed, name: "", url: "" });
            }}
          >
            <Plus size={18} /> Aggiungi
          </button>
        </details>
      </section>

      <section className="card settings-card">
        <h2>
          <span className="box-icon ic-green">
            <Volume2 size={17} />
          </span>
          Lettura ad alta voce
        </h2>
        {!speechSupported && <p className="hint">Questo browser non supporta la sintesi vocale.</p>}
        <label className="field">
          Velocità
          <div className="seg">
            {RATES.map((r) => (
              <button key={r} className={s.speechRate === r ? "active" : ""} onClick={() => set({ speechRate: r })}>
                {r.toLocaleString("it-IT")}×
              </button>
            ))}
          </div>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.readDetails} onChange={(e) => set({ readDetails: e.target.checked })} />
          Leggi anche punti chiave e cautele
        </label>
        <label className="check">
          <input type="checkbox" checked={s.readGlossary} onChange={(e) => set({ readGlossary: e.target.checked })} />
          Spiega anche i termini difficili
        </label>
        <button className="btn-soft" disabled={!speechSupported} onClick={() => void speak("Ecco come suona la voce delle notizie.", s.speechRate)}>
          <Volume2 size={18} /> Prova la voce
        </button>
      </section>

      <p className="hint privacy">
        <ShieldCheck size={16} />
        {isNative
          ? "La chiave resta salvata solo su questo telefono e viene inviata unicamente ad Anthropic. I feed vengono letti direttamente dai siti delle testate."
          : "Le impostazioni restano in questo browser."}
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
    </div>
  );
}
