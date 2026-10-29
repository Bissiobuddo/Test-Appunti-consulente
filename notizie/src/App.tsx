import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  CircleCheck,
  CloudOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Newspaper,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  TriangleAlert,
  Volume2,
} from "lucide-react";
import { CATEGORIES, categoryLabel, type CategoryId } from "../shared/sources.ts";
import type { Engine, Story } from "../shared/schema.ts";
import { StoryCard } from "./components/StoryCard.tsx";
import { CarMode } from "./components/CarMode.tsx";
import { Settings } from "./components/Settings.tsx";
import { isNative } from "./lib/platform.ts";
import { checkPassword, fetchConfig, getPassword, loadCategory, setPassword, type ServerConfig } from "./lib/api.ts";
import { loadSettings, saveSettings } from "./lib/settings.ts";
import { loadDigests, pruneExtras, saveDigests, type Digests } from "./lib/storage.ts";
import { readingQueue, spokenStory, storyArticles, type ReadingItem } from "./lib/reading.ts";
import { SPEECH_ERROR, speak, speechSupported, stopSpeaking } from "./lib/speech.ts";

const OFFLINE: ServerConfig = { authRequired: false, aiAvailable: false };
const FILTER_KEY = "notizie-filter";
const PARALLEL = 3;

type Status = "loading" | { error: string };

function Login({ onOk }: { onOk: () => void }) {
  const [pw, setPw] = useState(getPassword());
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="login card"
      onSubmit={async (e) => {
        e.preventDefault();
        setPassword(pw);
        try {
          await checkPassword();
          onOk();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }}
    >
      <div className="logo">
        <LockKeyhole size={28} />
      </div>
      <h1>Notizie Chiare</h1>
      <p className="hint">Inserisci la password per continuare</p>
      <input type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
      <button className="btn-primary">Entra</button>
      {error && (
        <p className="msg error">
          <TriangleAlert size={18} /> {error}
        </p>
      )}
    </form>
  );
}

function loadFilter(): { categories: CategoryId[]; onlyConfirmed: boolean } {
  try {
    return { categories: [], onlyConfirmed: false, ...JSON.parse(localStorage.getItem(FILTER_KEY) ?? "{}") };
  } catch {
    return { categories: [], onlyConfirmed: false };
  }
}

function ago(t: number): string {
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 2) return "adesso";
  if (min < 60) return `${min} minuti fa`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? "un'ora fa" : `${h} ore fa`;
  return new Date(t).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

/** Esegue le funzioni al massimo `limit` alla volta. */
async function inBatches<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
  }));
}

export function App() {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [authed, setAuthed] = useState(false);
  const [settings, setSettings] = useState(loadSettings);
  const [digests, setDigests] = useState<Digests>({});
  const digestsRef = useRef<Digests>({});
  const [status, setStatus] = useState<Partial<Record<CategoryId, Status>>>({});
  const [filter, setFilter] = useState(loadFilter);
  const [view, setView] = useState<"home" | "settings" | "car">("home");
  const [carItems, setCarItems] = useState<ReadingItem[]>([]);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);

  const loadConfig = () =>
    fetchConfig()
      .then(async (c) => {
        setConfig(c);
        if (!c.authRequired) return setAuthed(true);
        if (getPassword()) await checkPassword().then(() => setAuthed(true), () => {});
      })
      .catch(() => {
        // server non raggiungibile: la rassegna salvata resta consultabile
        setConfig(OFFLINE);
        setAuthed(true);
      });

  useEffect(() => {
    void loadConfig();
    void loadDigests().then((d) => {
      digestsRef.current = d;
      setDigests(d);
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(filter));
    } catch {
      // filtro non salvato: vale per questa sessione
    }
  }, [filter]);

  const storyFilter = (s: Story) => !filter.onlyConfirmed || s.reliability === "confermata";
  const shownCategories = CATEGORIES.map((c) => c.id).filter(
    (id) => digests[id] && (!filter.categories.length || filter.categories.includes(id)),
  );
  const shownDigests = shownCategories.map((id) => digests[id]!);
  const storyCount = shownDigests.reduce((n, d) => n + d.stories.filter(storyFilter).length, 0);
  const loading = Object.values(status).some((s) => s === "loading");
  const newest = Math.max(0, ...Object.values(digests).map((d) => d.generatedAt));
  const stale = newest > 0 && Date.now() - newest > 4 * 3600_000;
  // Senza una scelta esplicita si usa l'AI solo se c'è una chiave (sul telefono o sul server).
  const engine: Engine = settings.engine ?? (config?.aiAvailable ? "ai" : "locale");
  const available = useMemo(() => CATEGORIES.filter((c) => digests[c.id] || settings.categories.includes(c.id)), [digests, settings.categories]);

  const refresh = async () => {
    const cats = settings.categories;
    setStatus(Object.fromEntries(cats.map((c) => [c, "loading"])));
    await inBatches(cats, PARALLEL, async (c) => {
      try {
        const d = await loadCategory(c, settings, engine);
        digestsRef.current = { ...digestsRef.current, [c]: d };
        setDigests(digestsRef.current);
        await saveDigests(digestsRef.current);
        setStatus((prev) => {
          const { [c]: _done, ...rest } = prev;
          return rest;
        });
      } catch (err) {
        setStatus((prev) => ({ ...prev, [c]: { error: err instanceof Error ? err.message : String(err) } }));
      }
    });
    void pruneExtras(digestsRef.current);
  };

  const listen = async (key: string, text: string) => {
    if (speakingKey === key) {
      await stopSpeaking();
      setSpeakingKey(null);
      return;
    }
    setSpeakingKey(key);
    const result = await speak(text, settings.speechRate);
    if (result === "stopped") return;
    setSpeakingKey(null);
    if (result === "failed") alert(SPEECH_ERROR);
  };

  if (!config)
    return (
      <p className="center">
        <LoaderCircle size={20} className="spin" /> Caricamento…
      </p>
    );
  if (!authed) return <Login onOk={() => setAuthed(true)} />;

  if (view === "settings") {
    return (
      <Settings
        defaultEngine={engine}
        onClose={() => {
          setSettings(loadSettings());
          setView("home");
          void loadConfig();
        }}
      />
    );
  }

  if (view === "car") {
    return (
      <CarMode
        items={carItems}
        rate={settings.speechRate}
        onRateChange={(speechRate) => {
          const next = { ...settings, speechRate };
          saveSettings(next);
          setSettings(next);
        }}
        onClose={() => setView("home")}
      />
    );
  }

  // Sul web anche la modalità senza AI passa dal server, che legge i feed.
  const serverOk = isNative || config !== OFFLINE;
  const canRefresh = serverOk && (engine === "locale" || config.aiAvailable) && settings.categories.length > 0 && !loading;
  // Lo stesso errore su più categorie (es. niente rete) si mostra una volta sola.
  const errors = new Map<string, CategoryId[]>();
  for (const [c, st] of Object.entries(status) as [CategoryId, Status][]) {
    if (typeof st === "object") errors.set(st.error, [...(errors.get(st.error) ?? []), c]);
  }

  return (
    <div className="home">
      <header className="home-header">
        <div className="logo">
          <Newspaper size={24} />
        </div>
        <div>
          <h1>
            Notizie <span className="gradient-text">Chiare</span>
          </h1>
          <p>{new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <button className="icon-btn" onClick={() => setView("settings")} aria-label="Impostazioni">
          <SettingsIcon size={20} />
        </button>
      </header>

      {isNative && engine === "ai" && !config.aiAvailable && (
        <button className="setup-banner card" onClick={() => setView("settings")}>
          <span className="box-icon ic-violet">
            <KeyRound size={17} />
          </span>
          <span>
            Collega l'AI
            <small>Inserisci la tua chiave Claude per preparare la rassegna</small>
          </span>
          <ChevronRight size={20} className="chev" style={{ marginLeft: "auto" }} />
        </button>
      )}
      {config === OFFLINE && (
        <p className="msg error">
          <CloudOff size={18} /> Server non raggiungibile: puoi consultare e ascoltare solo le notizie già salvate.
        </p>
      )}
      {!isNative && engine === "ai" && config !== OFFLINE && !config.aiAvailable && (
        <p className="msg error">
          <KeyRound size={18} /> Sul server manca la chiave ANTHROPIC_API_KEY.
        </p>
      )}

      <div className="actions">
        <button
          className="hero-btn"
          disabled={!storyCount || !speechSupported}
          onClick={() => {
            void stopSpeaking();
            setSpeakingKey(null);
            setCarItems(readingQueue(shownDigests, storyFilter, settings));
            setView("car");
          }}
        >
          <span className="hero-icon">
            <Volume2 size={30} />
          </span>
          <span>
            <strong>Ascolta le notizie</strong>
            <small>{storyCount ? `${storyCount} notizie · modalità auto` : "Prima aggiorna la rassegna"}</small>
          </span>
        </button>
        <button className="refresh-btn card" disabled={!canRefresh} onClick={() => void refresh()}>
          {loading ? <LoaderCircle size={22} className="spin" /> : <RefreshCw size={22} />}
          <span>
            <strong>{loading ? "Aggiorno…" : "Aggiorna"}</strong>
            <small>{newest ? ago(newest) : "mai"}</small>
          </span>
        </button>
      </div>

      {stale && !loading && (
        <p className="msg warn">
          <TriangleAlert size={18} /> Le notizie sono di {ago(newest)}: tocca «Aggiorna» per quelle di oggi.
        </p>
      )}

      {loading && (
        <ul className="progress card">
          {settings.categories.map((c) => (
            <li key={c}>
              {status[c] === "loading" ? <LoaderCircle size={16} className="spin" /> : typeof status[c] === "object" ? <TriangleAlert size={16} className="err" /> : <CircleCheck size={16} className="ok" />}
              {categoryLabel(c)}
              <small>{status[c] === "loading" ? "leggo e confronto le fonti…" : typeof status[c] === "object" ? "errore" : "pronta"}</small>
            </li>
          ))}
        </ul>
      )}

      {[...errors].map(([message, cats]) => (
        <p key={message} className="msg error">
          <TriangleAlert size={18} /> {cats.map(categoryLabel).join(", ")}: {message}
        </p>
      ))}

      {available.length > 0 && (
        <div className="filters">
          <div className="chips" role="group" aria-label="Filtra per categoria">
            <button className={`chip ${!filter.categories.length ? "active" : ""}`} aria-pressed={!filter.categories.length} onClick={() => setFilter({ ...filter, categories: [] })}>
              Tutte
            </button>
            {available.map((c) => {
              const on = filter.categories.includes(c.id);
              return (
                <button
                  key={c.id}
                  className={`chip ${on ? "active" : ""}`}
                  aria-pressed={on}
                  onClick={() => setFilter({ ...filter, categories: on ? filter.categories.filter((x) => x !== c.id) : [...filter.categories, c.id] })}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <label className="check confirmed-toggle">
            <input type="checkbox" checked={filter.onlyConfirmed} onChange={(e) => setFilter({ ...filter, onlyConfirmed: e.target.checked })} />
            <ShieldCheck size={16} /> Solo notizie confermate da più fonti
          </label>
        </div>
      )}

      {shownDigests.map((d) => {
        const stories = d.stories.map((s, i) => ({ s, i })).filter(({ s }) => storyFilter(s));
        return (
          <section key={d.category} className="category">
            <h2 className="section-label">
              {categoryLabel(d.category)}
              <small>
                {d.articleCount} articoli confrontati · {ago(d.generatedAt)}
              </small>
            </h2>
            {d.failedSources.length > 0 && <p className="hint">Non raggiungibili: {d.failedSources.join(", ")}.</p>}
            {!stories.length && <p className="hint">Nessuna notizia {filter.onlyConfirmed ? "confermata " : ""}in questa categoria.</p>}
            <div className="story-list">
              {stories.map(({ s, i }) => {
                const key = `${d.category}:${i}`;
                return (
                  <StoryCard
                    key={`${d.generatedAt}:${i}`}
                    story={s}
                    index={i}
                    digest={d}
                    speaking={speakingKey === key}
                    onListen={() => void listen(key, spokenStory(s, storyArticles(s, d), settings))}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      {!Object.keys(digests).length && !loading && (
        <div className="empty">
          <div className="empty-icon">
            <Newspaper size={30} />
          </div>
          <p>
            <strong>Ancora nessuna rassegna</strong>
          </p>
          <p>
            {engine === "ai"
              ? "Tocca «Aggiorna»: l'AI legge le principali testate, confronta le fonti e riassume le notizie del giorno."
              : "Tocca «Aggiorna»: l'app legge le principali testate, raggruppa le notizie uguali e confronta le fonti. Gratis, senza AI."}
          </p>
        </div>
      )}
    </div>
  );
}
