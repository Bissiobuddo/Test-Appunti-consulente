import { useEffect, useState } from "react";
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
      className="login"
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
      <h1>🎙️ Appunti Vocali AI</h1>
      <input type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
      <button className="primary">Entra</button>
      {error && <p className="error">{error}</p>}
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

  if (!config) return <p className="center">Caricamento…</p>;
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
        <h1>🎙️ Appunti Vocali AI</h1>
        {config === OFFLINE && <p className="error">Server non raggiungibile: puoi solo consultare gli appunti salvati.</p>}
      </header>
      <button
        className="big-btn new-note"
        onClick={async () => {
          const n = newNote();
          await saveNote(n);
          setCurrent(n);
        }}
      >
        <span className="big-icon">＋</span> Nuovo appunto
      </button>
      {notes.length > 3 && (
        <input className="search" placeholder="Cerca negli appunti…" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      <ul className="note-list">
        {shown.map((n) => (
          <li key={n.id}>
            <button onClick={async () => setCurrent((await getNote(n.id)) ?? n)}>
              <strong>{n.title}</strong>
              <span className="meta">
                {new Date(n.updatedAt).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })}
                {n.organized ? " · organizzato" : ""}
              </span>
              <span className="preview">{n.organized?.summary ?? n.transcript.slice(0, 140)}</span>
            </button>
          </li>
        ))}
        {!notes.length && <li className="hint">Nessun appunto. Premi «Nuovo appunto» e poi «Detta» per iniziare.</li>}
      </ul>
    </div>
  );
}
