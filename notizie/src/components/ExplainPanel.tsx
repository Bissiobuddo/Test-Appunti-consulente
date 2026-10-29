import { useEffect, useState } from "react";
import { BookOpen, Compass, GraduationCap, HelpCircle, Lightbulb, LoaderCircle, MessageCircleQuestion, Send, TriangleAlert } from "lucide-react";
import type { Article } from "../../shared/feeds.ts";
import type { CategoryDigest, Story } from "../../shared/schema.ts";
import { ask, explain } from "../lib/api.ts";
import { loadSettings } from "../lib/settings.ts";
import { loadExtras, saveExtras, storyKey, type StoryExtras } from "../lib/storage.ts";

interface Props {
  story: Story;
  index: number;
  digest: CategoryDigest;
  articles: Article[];
}

/** «Spiegamelo»: contesto, termini e implicazioni per chi non segue la notizia, più domande libere. */
export function ExplainPanel({ story, index, digest, articles }: Props) {
  const key = storyKey(digest, index);
  const [extras, setExtras] = useState<StoryExtras>({ qa: [] });
  const [busy, setBusy] = useState<"explain" | "ask" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");

  useEffect(() => void loadExtras(key).then(setExtras), [key]);

  const update = (next: StoryExtras) => {
    setExtras(next);
    void saveExtras(key, next);
  };

  const run = async (kind: "explain" | "ask", fn: () => Promise<StoryExtras>) => {
    setBusy(kind);
    setError(null);
    try {
      update(await fn());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const onExplain = () => run("explain", async () => ({ ...extras, explanation: await explain(story, articles, loadSettings()) }));

  const onAsk = () => {
    const q = question.trim();
    if (!q) return;
    void run("ask", async () => {
      const answer = await ask(story, articles, q, extras.qa, loadSettings());
      setQuestion("");
      return { ...extras, qa: [...extras.qa, { question: q, answer }] };
    });
  };

  const e = extras.explanation;

  return (
    <section className="explain">
      {!e && (
        <button className="explain-btn" onClick={onExplain} disabled={busy !== null}>
          {busy === "explain" ? <LoaderCircle size={20} className="spin" /> : <GraduationCap size={20} />}
          <span>
            <strong>{busy === "explain" ? "Preparo la spiegazione…" : "Spiegamelo"}</strong>
            <small>Contesto, termini e cosa può cambiare, per chi parte da zero</small>
          </span>
        </button>
      )}

      {e && (
        <div className="explanation card">
          <h3>
            <Compass size={18} /> Il contesto
          </h3>
          <p>{e.background}</p>
          <h3>
            <Lightbulb size={18} /> Perché conta
          </h3>
          <p>{e.why_it_matters}</p>
          {e.implications.length > 0 && (
            <>
              <h3>
                <GraduationCap size={18} /> Possibili implicazioni
              </h3>
              <ul>
                {e.implications.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </>
          )}
          {e.glossary.length > 0 && (
            <>
              <h3>
                <BookOpen size={18} /> Parole da capire
              </h3>
              <dl>
                {e.glossary.map((g, i) => (
                  <div key={i}>
                    <dt>{g.term}</dt>
                    <dd>{g.explanation}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {e.open_questions.length > 0 && (
            <>
              <h3>
                <HelpCircle size={18} /> Cosa non sappiamo ancora
              </h3>
              <ul>
                {e.open_questions.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </>
          )}
          <p className="hint">Spiegazione dell'AI basata sulle fonti e su conoscenze generali, che potrebbero non includere gli sviluppi più recenti.</p>
        </div>
      )}

      {extras.qa.map((qa, i) => (
        <div key={i} className="qa">
          <p className="q">
            <MessageCircleQuestion size={16} /> {qa.question}
          </p>
          <p className="a">{qa.answer}</p>
        </div>
      ))}

      <form
        className="ask-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          onAsk();
        }}
      >
        <input
          placeholder="Fai una domanda su questa notizia"
          value={question}
          onChange={(ev) => setQuestion(ev.target.value)}
          disabled={busy !== null}
          aria-label="Domanda sulla notizia"
        />
        <button className="icon-btn send" disabled={busy !== null || !question.trim()} aria-label="Chiedi">
          {busy === "ask" ? <LoaderCircle size={18} className="spin" /> : <Send size={18} />}
        </button>
      </form>

      {error && (
        <p className="msg error">
          <TriangleAlert size={18} /> {error}
        </p>
      )}
    </section>
  );
}
