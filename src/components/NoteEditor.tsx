import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, AudioLines, Check, Copy, FileCode, FileDown, FileText, FileType, Globe, Image, ListTree,
  LoaderCircle, Maximize2, Network, PenLine, Share2, ShieldCheck, Sparkles, Trash2, TriangleAlert, WandSparkles,
  type LucideIcon,
} from "lucide-react";
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

interface ExportTileProps {
  icon: LucideIcon;
  color: string;
  label: string;
  desc: string;
  onClick: () => unknown;
}

function ExportTile({ icon: Icon, color, label, desc, onClick }: ExportTileProps) {
  return (
    <button className="export-tile card" onClick={() => void onClick()}>
      <span className={`tile-ic ${color}`}>
        <Icon size={20} />
      </span>
      <span className="tile-txt">
        {label}
        <small>{desc}</small>
      </span>
    </button>
  );
}

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
  const [toast, setToast] = useState<string | null>(null);
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

  function notify(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 2200);
  }

  const tabs: { id: Tab; label: string; icon: LucideIcon; needsAi: boolean }[] = [
    { id: "trascrizione", label: "Trascrizione", icon: AudioLines, needsAi: false },
    { id: "appunti", label: "Appunti", icon: ListTree, needsAi: true },
    { id: "mappa", label: "Mappa", icon: Network, needsAi: true },
    { id: "esporta", label: "Esporta", icon: Share2, needsAi: false },
  ];

  return (
    <div className="editor">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Torna agli appunti">
          <ArrowLeft size={20} />
        </button>
        <input className="title-input" value={note.title} onChange={(e) => patch({ title: e.target.value })} aria-label="Titolo" />
        <button
          className="icon-btn danger"
          aria-label="Elimina appunto"
          onClick={() => confirm("Eliminare questo appunto?") && onDelete(note.id)}
        >
          <Trash2 size={19} />
        </button>
      </header>

      <nav className="tabs card" role="tablist">
        {tabs.map(({ id, label, icon: Icon, needsAi }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
            disabled={needsAi && !o}
            title={needsAi && !o ? "Disponibile dopo l'organizzazione con AI" : undefined}
          >
            <Icon size={19} />
            {label}
          </button>
        ))}
      </nav>

      {tab === "trascrizione" && (
        <div className="panel">
          <Capture transcriptionAvailable={config.transcriptionAvailable} onText={appendText} />
          <div className="transcript-wrap card">
            <textarea
              className="transcript"
              placeholder="Il testo dettato o trascritto compare qui. Puoi anche scriverlo o incollarlo."
              value={note.transcript}
              onChange={(e) => patch({ transcript: e.target.value })}
              aria-label="Trascrizione"
            />
          </div>
          <div className="ai-controls card">
            <h3>
              <WandSparkles size={18} className="gradient-icon" /> Organizza con AI
            </h3>
            <div className="mode-cards" role="radiogroup" aria-label="Modalità">
              <button role="radio" aria-checked={mode === "fedele"} className={`mode-card ${mode === "fedele" ? "active" : ""}`} onClick={() => setMode("fedele")}>
                <strong>
                  <ShieldCheck size={18} /> Fedele
                </strong>
                <span>Solo ciò che hai detto, con gli errori corretti</span>
              </button>
              <button role="radio" aria-checked={mode === "amplia"} className={`mode-card ${mode === "amplia" ? "active" : ""}`} onClick={() => setMode("amplia")}>
                <strong>
                  <Sparkles size={18} /> Amplia
                </strong>
                <span>Aggiunge spunti, sempre segnati come AI</span>
              </button>
            </div>
            <input
              className="instructions"
              placeholder="Istruzioni facoltative, es. «dividi per cliente»"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              aria-label="Istruzioni per l'AI"
            />
            <button className="btn-primary" disabled={working || !note.transcript.trim() || !config.aiAvailable} onClick={() => runAi(mode)}>
              {working ? <LoaderCircle size={20} className="spin" /> : <Sparkles size={20} />}
              {working ? "Sto organizzando…" : o ? "Rielabora con AI" : "Organizza con AI"}
            </button>
            {!config.aiAvailable && (
              <p className="msg error">
                <TriangleAlert size={18} /> AI non configurata sul server (ANTHROPIC_API_KEY).
              </p>
            )}
            {error && (
              <p className="msg error">
                <TriangleAlert size={18} /> {error}
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "appunti" && o && (
        <div className="panel">
          <OrganizedView data={o} onChange={(organized) => patch({ organized })} />
          <p className="hint" style={{ textAlign: "center" }}>
            <PenLine size={14} style={{ verticalAlign: -2 }} /> Tocca un punto per modificarlo
          </p>
          {note.organizedMode !== "amplia" && (
            <button className="btn-primary" style={{ width: "100%", marginTop: 8 }} disabled={working} onClick={() => runAi("amplia")}>
              {working ? <LoaderCircle size={20} className="spin" /> : <Sparkles size={20} />}
              {working ? "Sto ampliando…" : "Amplia con AI"}
            </button>
          )}
          {error && (
            <p className="msg error">
              <TriangleAlert size={18} /> {error}
            </p>
          )}
        </div>
      )}

      {tab === "mappa" && o && (
        <div className="panel map-panel">
          <div className="card map-wrap">
            <Suspense
              fallback={
                <p className="center" style={{ marginTop: 0, height: "64vh" }}>
                  <LoaderCircle size={20} className="spin" /> Caricamento mappa…
                </p>
              }
            >
              <MindMap ref={mapRef} markdown={toMindmapMarkdown(o)} />
            </Suspense>
          </div>
          <div className="row">
            <button className="chip" onClick={() => mapRef.current?.fit()}>
              <Maximize2 size={17} /> Adatta
            </button>
            <button className="chip" onClick={() => mapRef.current?.svg && ex.exportSvg(mapRef.current.svg, note)}>
              <Image size={17} /> Immagine
            </button>
            <button className="chip" onClick={() => ex.exportMindmapHtml(note)}>
              <Globe size={17} /> Pagina interattiva
            </button>
          </div>
          <p className="hint">Tocca un nodo per aprire o chiudere i rami, pizzica per lo zoom.</p>
        </div>
      )}

      {tab === "esporta" && (
        <div className="panel export">
          <h3>Documento</h3>
          <div className="export-grid">
            <ExportTile icon={FileType} color="ic-blue" label="Word" desc=".docx modificabile" onClick={() => ex.exportDocx(note)} />
            <ExportTile icon={FileText} color="ic-red" label="PDF" desc="Pronto da stampare o inviare" onClick={() => ex.exportPdf(note)} />
            <ExportTile icon={FileCode} color="ic-slate" label="Markdown" desc=".md per Notion, Obsidian…" onClick={() => ex.exportMarkdown(note)} />
            <ExportTile icon={FileDown} color="ic-teal" label="Testo semplice" desc=".txt" onClick={() => ex.exportText(note)} />
            <ExportTile
              icon={Copy}
              color="ic-green"
              label="Copia trascrizione"
              desc="Negli appunti del dispositivo"
              onClick={async () => {
                await navigator.clipboard?.writeText(note.transcript);
                notify("Trascrizione copiata");
              }}
            />
          </div>
          <h3>Mappa mentale</h3>
          {o ? (
            <div className="export-grid">
              <ExportTile icon={Globe} color="ic-violet" label="Pagina interattiva" desc=".html, si apre nel browser" onClick={() => ex.exportMindmapHtml(note)} />
              <ExportTile icon={Network} color="ic-amber" label="XMind / FreeMind" desc=".mm, anche MindMeister" onClick={() => ex.exportFreeMind(note)} />
              <ExportTile icon={ListTree} color="ic-slate" label="OPML" desc="Per outliner e altre app" onClick={() => ex.exportOpml(note)} />
            </div>
          ) : (
            <p className="hint">Organizza prima gli appunti con l'AI per esportare la mappa mentale.</p>
          )}
          <p className="hint" style={{ marginTop: 18 }}>
            Su Android si apre il menu Condividi (Drive, email, WhatsApp…). Su computer il file viene scaricato.
          </p>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <Check size={18} /> {toast}
        </div>
      )}
    </div>
  );
}
