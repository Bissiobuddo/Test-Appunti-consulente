import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Capture } from "./Capture.tsx";
import { OrganizedView } from "./OrganizedView.tsx";
import type { MindMapHandle } from "./MindMap.tsx";
import { organize, type ServerConfig } from "../lib/api.ts";
import { toMindmapMarkdown } from "../lib/format.ts";
import { saveNote } from "../lib/storage.ts";
import type { Note, OrganizeMode } from "../lib/types.ts";

const MindMap = lazy(() => import("./MindMap.tsx").then((m) => ({ default: m.MindMap })));

// Le librerie di esportazione (docx, pdf) si caricano solo al primo utilizzo.
const ex = new Proxy({} as typeof import("../lib/export.ts"), {
  get: (_t, name: string) => async (...args: unknown[]) => {
    const mod = (await import("../lib/export.ts")) as unknown as Record<string, (...a: unknown[]) => unknown>;
    return mod[name](...args);
  },
});

type Tab = "trascrizione" | "appunti" | "mappa" | "esporta";

interface Props {
  initial: Note;
  config: ServerConfig;
  onBack: () => void;
  onDelete: (id: string) => void;
}

export function NoteEditor({ initial, config, onBack, onDelete }: Props) {
  const [note, setNote] = useState(initial);
  const [tab, setTab] = useState<Tab>(initial.organized ? "appunti" : "trascrizione");
  const [mode, setMode] = useState<OrganizeMode>("fedele");
  const [instructions, setInstructions] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapRef = useRef<MindMapHandle>(null);
  const first = useRef(true);

  // Salvataggio automatico
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => void saveNote(note), 400);
    return () => clearTimeout(t);
  }, [note]);

  const patch = (p: Partial<Note>) => setNote((n) => ({ ...n, ...p, updatedAt: Date.now() }));

  const appendText = (text: string) =>
    setNote((n) => ({
      ...n,
      transcript: n.transcript ? `${n.transcript.trimEnd()}${/[.!?]$/.test(n.transcript.trim()) ? " " : ". "}${text}` : text,
      updatedAt: Date.now(),
    }));

  async function runAi(m: OrganizeMode) {
    setWorking(true);
    setError(null);
    try {
      const organized = await organize(note.transcript, m, instructions);
      patch({ organized, organizedMode: m, title: organized.title });
      setTab("appunti");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  }

  const o = note.organized;

  return (
    <div className="editor">
      <header className="topbar">
        <button className="icon" onClick={onBack} aria-label="Indietro">
          ←
        </button>
        <input className="title-input" value={note.title} onChange={(e) => patch({ title: e.target.value })} />
        <button
          className="icon danger"
          aria-label="Elimina"
          onClick={() => confirm("Eliminare questo appunto?") && onDelete(note.id)}
        >
          🗑
        </button>
      </header>

      <nav className="tabs">
        {(["trascrizione", "appunti", "mappa", "esporta"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)} disabled={t !== "trascrizione" && t !== "esporta" && !o}>
            {{ trascrizione: "Trascrizione", appunti: "Appunti", mappa: "Mappa", esporta: "Esporta" }[t]}
          </button>
        ))}
      </nav>

      {tab === "trascrizione" && (
        <div className="panel">
          <Capture transcriptionAvailable={config.transcriptionAvailable} onText={appendText} />
          <textarea
            className="transcript"
            placeholder="Il testo dettato o trascritto compare qui. Puoi anche scriverlo o incollarlo."
            value={note.transcript}
            onChange={(e) => patch({ transcript: e.target.value })}
          />
          <div className="ai-controls">
            <div className="segmented" role="radiogroup">
              <button className={mode === "fedele" ? "active" : ""} onClick={() => setMode("fedele")}>
                Fedele
              </button>
              <button className={mode === "amplia" ? "active" : ""} onClick={() => setMode("amplia")}>
                Amplia ✦
              </button>
            </div>
            <p className="hint">
              {mode === "fedele"
                ? "Organizza in elenco puntato e corregge solo errori evidenti, senza aggiungere nulla."
                : "Come Fedele, in più aggiunge spiegazioni e spunti, sempre marcati con ✦."}
            </p>
            <input
              className="instructions"
              placeholder="Istruzioni facoltative (es. «dividi per cliente», «più sintetico»)"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
            <button className="primary" disabled={working || !note.transcript.trim() || !config.aiAvailable} onClick={() => runAi(mode)}>
              {working ? "Elaborazione AI…" : o ? "✨ Rielabora con AI" : "✨ Organizza con AI"}
            </button>
            {!config.aiAvailable && <p className="error">AI non configurata sul server (ANTHROPIC_API_KEY).</p>}
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}

      {tab === "appunti" && o && (
        <div className="panel">
          <OrganizedView data={o} onChange={(organized) => patch({ organized })} />
          <div className="row">
            {note.organizedMode !== "amplia" && (
              <button className="secondary" disabled={working} onClick={() => runAi("amplia")}>
                {working ? "Elaborazione…" : "✦ Amplia con AI"}
              </button>
            )}
            {error && <p className="error">{error}</p>}
          </div>
        </div>
      )}

      {tab === "mappa" && o && (
        <div className="panel map-panel">
          <Suspense fallback={<p className="hint">Caricamento mappa…</p>}>
            <MindMap ref={mapRef} markdown={toMindmapMarkdown(o)} />
          </Suspense>
          <div className="row">
            <button className="secondary" onClick={() => mapRef.current?.fit()}>
              ⤢ Adatta
            </button>
            <button className="secondary" onClick={() => mapRef.current?.svg && ex.exportSvg(mapRef.current.svg, note)}>
              Immagine SVG
            </button>
            <button className="secondary" onClick={() => ex.exportMindmapHtml(note)}>
              Pagina interattiva
            </button>
          </div>
        </div>
      )}

      {tab === "esporta" && (
        <div className="panel export">
          <h3>Documento</h3>
          <div className="grid">
            <button onClick={() => ex.exportDocx(note)}>📄 Word (.docx)</button>
            <button onClick={() => ex.exportPdf(note)}>📕 PDF</button>
            <button onClick={() => ex.exportMarkdown(note)}>Ⓜ️ Markdown (.md)</button>
            <button onClick={() => ex.exportText(note)}>📝 Testo (.txt)</button>
            <button onClick={() => navigator.clipboard?.writeText(note.transcript)}>📋 Copia trascrizione</button>
          </div>
          <h3>Mappa mentale</h3>
          {o ? (
            <div className="grid">
              <button onClick={() => ex.exportMindmapHtml(note)}>🌐 HTML interattivo</button>
              <button onClick={() => ex.exportFreeMind(note)}>🧠 FreeMind / XMind (.mm)</button>
              <button onClick={() => ex.exportOpml(note)}>🗂 OPML</button>
            </div>
          ) : (
            <p className="hint">Organizza prima gli appunti con l'AI per esportare la mappa mentale.</p>
          )}
          <p className="hint">Su Android si apre il menu di condivisione (Drive, email, WhatsApp…); su desktop il file viene scaricato.</p>
        </div>
      )}
    </div>
  );
}
