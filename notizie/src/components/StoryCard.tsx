import { useState } from "react";
import { BookOpen, ChevronDown, ExternalLink, Scale, Square, TriangleAlert, Volume2 } from "lucide-react";
import type { CategoryDigest, Story } from "../../shared/schema.ts";
import { SOURCE_KIND_LABEL } from "../../shared/sources.ts";
import { RELIABILITY_INFO, sourceNames, storyArticles } from "../lib/reading.ts";
import { ExplainPanel } from "./ExplainPanel.tsx";

interface Props {
  story: Story;
  index: number;
  digest: CategoryDigest;
  speaking: boolean;
  onListen: () => void;
}

const time = (t?: number) => (t ? new Date(t).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "");

export function ReliabilityBadge({ story }: { story: Story }) {
  const info = RELIABILITY_INFO[story.reliability];
  return (
    <span className={`rel-badge rel-${story.reliability}`} title={info.hint}>
      <Scale size={12} aria-hidden /> {info.label}
    </span>
  );
}

export function StoryCard({ story, index, digest, speaking, onListen }: Props) {
  const [open, setOpen] = useState(false);
  const articles = storyArticles(story, digest);
  const nameOf = (id: number) => digest.articles.find((a) => a.id === id)?.sourceName ?? "?";

  return (
    <article className={`story card ${open ? "open" : ""}`}>
      <button className="story-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="story-meta">
          <ReliabilityBadge story={story} />
          {story.importance === "alta" && <span className="imp-badge">In evidenza</span>}
        </span>
        <strong className="story-title">{story.title}</strong>
        <span className="story-summary">
          {story.summary}
          {story.summary_source && <em className="summary-src"> — dal sommario di {story.summary_source}</em>}
        </span>
        <span className="source-chips">
          {sourceNames(articles).map((n) => (
            <span key={n} className="source-chip">
              {n}
            </span>
          ))}
          <ChevronDown size={18} className="chev" />
        </span>
      </button>

      {open && (
        <div className="story-body">
          {story.key_points.length > 0 && (
            <ul className="key-points">
              {story.key_points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}

          <section className="box compare">
            <h3>
              <span className="box-icon ic-teal">
                <Scale size={16} />
              </span>
              Confronto tra le fonti
            </h3>
            <p>{story.reliability_note}</p>
            {story.discrepancies.map((d, i) => (
              <div key={i} className="discrepancy">
                <strong>{d.point}</strong>
                <ul>
                  {d.versions.map((v, j) => (
                    <li key={j}>
                      <em>{[...new Set(v.article_ids.map(nameOf))].join(", ")}:</em> {v.claim}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          {story.caveats.length > 0 && (
            <section className="box unclear">
              <h3>
                <span className="box-icon">
                  <TriangleAlert size={16} />
                </span>
                Da prendere con cautela
              </h3>
              <ul>
                {story.caveats.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </section>
          )}

          {story.glossary.length > 0 && (
            <section className="box glossary">
              <h3>
                <span className="box-icon ic-violet">
                  <BookOpen size={16} />
                </span>
                Termini
              </h3>
              <dl>
                {story.glossary.map((g, i) => (
                  <div key={i}>
                    <dt>{g.term}</dt>
                    <dd>{g.explanation}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <h3 className="sources-title">Fonti citate</h3>
          <ul className="source-list">
            {articles.map((a) => (
              <li key={a.id}>
                <a href={a.url} target="_blank" rel="noreferrer">
                  <span className="src-name">
                    {a.sourceName}
                    <small>
                      {SOURCE_KIND_LABEL[a.kind]}
                      {a.publishedAt ? ` · ${time(a.publishedAt)}` : ""}
                    </small>
                  </span>
                  <span className="src-title">{a.title}</span>
                  <ExternalLink size={15} className="ext" />
                </a>
              </li>
            ))}
          </ul>
          <p className="hint">
            {digest.engine === "locale"
              ? "Raggruppamento e confronto automatici, senza AI: il testo è il sommario pubblicato dalla testata. Per i dettagli apri gli articoli."
              : "Riassunto e confronto sono generati dall'AI a partire da titoli e sommari: per i dettagli apri gli articoli."}
          </p>

          <div className="row">
            <button className="btn-soft" onClick={onListen}>
              {speaking ? <Square size={18} /> : <Volume2 size={18} />} {speaking ? "Ferma" : "Ascolta"}
            </button>
          </div>

          <ExplainPanel story={story} index={index} digest={digest} articles={articles} />
        </div>
      )}
    </article>
  );
}
