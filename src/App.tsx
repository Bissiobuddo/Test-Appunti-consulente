import { useEffect, useState } from "react";
import { ChevronRight, CloudOff, FileText, LoaderCircle, LockKeyhole, Mic, Plus, Search, Sparkles, TriangleAlert } from "lucide-react";
import { NoteEditor } from "./components/NoteEditor.tsx";
import { checkPassword, fetchConfig, getPassword, setPassword, type ServerConfig } from "./lib/api.ts";
import { deleteNote, getNote, listNotes, newNote, saveNote } from "./lib/storage.ts";
import type { Note } from "./lib/types.ts";

const OFFLINE: ServerConfig = { authRequired: false, aiAvailable: false, transcriptionAvailable: false };

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
      <h1>Appunti Vocali AI</h1>
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

export function App() {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [authed, setAuthed] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [current, setCurrent] = useState<Note | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetchConfig()
      .then(async (c) => {
        setConfig(c);
        if (!c.authRequired) return setAuthed(true);
        if (getPassword()) await checkPassword().then(() => setAuthed(true), () => {});
      })
      .catch(() => {
        // server non raggiungibile: gli appunti salvati restano consultabili
        setConfig(OFFLINE);
        setAuthed(true);
      });
  }, []);

  const refresh = () => void listNotes().then(setNotes);
  useEffect(refresh, [current]);

  if (!config)
    return (
      <p className="center">
        <LoaderCircle size={20} className="spin" /> Caricamento…
      </p>
    );
  if (!authed) return <Login onOk={() => setAuthed(true)} />;

  if (current) {
    return (
      <NoteEditor
        key={current.id}
        initial={current}
        config={config}
        onBack={async () => setCurrent(null)}
        onDelete={async (id) => {
          await deleteNote(id);
          setCurrent(null);
        }}
      />
    );
  }

  const q = query.toLowerCase();
  const shown = notes.filter((n) => !q || n.title.toLowerCase().includes(q) || n.transcript.toLowerCase().includes(q));

  return (
    <div className="home">
      <header className="home-header">
        <div className="logo">
          <Mic size={24} />
        </div>
        <div>
          <h1>
            Appunti <span className="gradient-text">Vocali AI</span>
          </h1>
          <p>Parla, all'ordine pensa l'AI</p>
        </div>
      </header>
      {config === OFFLINE && (
        <p className="msg error">
          <CloudOff size={18} /> Server non raggiungibile: puoi solo consultare gli appunti salvati.
        </p>
      )}
      <button
        className="hero-btn"
        onClick={async () => {
          const n = newNote();
          await saveNote(n);
          setCurrent(n);
        }}
      >
        <span className="hero-icon">
          <Plus size={30} />
        </span>
        <span>
          <strong>Nuovo appunto</strong>
          <small>Detta, registra o carica un audio</small>
        </span>
      </button>
      {notes.length > 3 && (
        <div className="search-wrap">
          <Search size={18} />
          <input placeholder="Cerca negli appunti" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Cerca" />
        </div>
      )}
      {notes.length > 0 && <h2 className="section-label">I tuoi appunti</h2>}
      <ul className="note-list">
        {shown.map((n) => (
          <li key={n.id}>
            <button className="note-card card" onClick={async () => setCurrent((await getNote(n.id)) ?? n)}>
              <span className={`badge-icon ${n.organized ? "done" : ""}`}>
                {n.organized ? <Sparkles size={20} /> : <FileText size={20} />}
              </span>
              <span className="body">
                <strong>{n.title}</strong>
                <span className="meta">
                  {new Date(n.updatedAt).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })}
                  {n.organized ? " · organizzato" : " · da organizzare"}
                </span>
                <span className="preview">{n.organized?.summary ?? (n.transcript.slice(0, 140) || "Nessun testo")}</span>
              </span>
              <ChevronRight size={20} className="chev" />
            </button>
          </li>
        ))}
      </ul>
      {!notes.length && (
        <div className="empty">
          <div className="empty-icon">
            <Mic size={30} />
          </div>
          <p>
            <strong>Ancora nessun appunto</strong>
          </p>
          <p>Tocca «Nuovo appunto» e poi «Detta» per iniziare a parlare.</p>
        </div>
      )}
      {notes.length > 0 && !shown.length && <p className="empty">Nessun risultato per «{query}»</p>}
    </div>
  );
}
