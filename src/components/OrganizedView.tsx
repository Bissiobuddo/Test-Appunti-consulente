import type { OrganizedNote } from "../lib/types.ts";

interface Props {
  data: OrganizedNote;
  onChange: (data: OrganizedNote) => void;
}

/** Testo modificabile al tocco: salva quando si esce dal campo. */
function Editable({ text, onSave }: { text: string; onSave: (t: string) => void }) {
  return (
    <span
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => {
        const t = e.currentTarget.textContent?.trim() ?? "";
        if (t !== text) onSave(t);
      }}
    >
      {text}
    </span>
  );
}

const AiBadge = () => (
  <span className="ai-badge" title="Aggiunto dall'AI, non presente nel parlato">
    ✦ AI
  </span>
);

export function OrganizedView({ data, onChange }: Props) {
  const update = (fn: (d: OrganizedNote) => void) => {
    const copy = structuredClone(data);
    fn(copy);
    onChange(copy);
  };

  return (
    <article className="organized">
      <h2>
        <Editable text={data.title} onSave={(t) => update((d) => void (d.title = t))} />
      </h2>
      <p className="summary">
        <Editable text={data.summary} onSave={(t) => update((d) => void (d.summary = t))} />
      </p>

      {data.sections.map((s, si) => (
        <section key={si}>
          <h3>
            <Editable text={s.heading} onSave={(t) => update((d) => void (d.sections[si].heading = t))} />
          </h3>
          <ul>
            {s.bullets.map((b, bi) => (
              <li key={bi} className={b.added_by_ai ? "ai" : ""}>
                <Editable text={b.text} onSave={(t) => update((d) => void (d.sections[si].bullets[bi].text = t))} />
                {b.added_by_ai && <AiBadge />}
                {b.sub_bullets.length > 0 && (
                  <ul>
                    {b.sub_bullets.map((sb, sbi) => (
                      <li key={sbi} className={sb.added_by_ai ? "ai" : ""}>
                        <Editable
                          text={sb.text}
                          onSave={(t) => update((d) => void (d.sections[si].bullets[bi].sub_bullets[sbi].text = t))}
                        />
                        {sb.added_by_ai && <AiBadge />}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {data.action_items.length > 0 && (
        <section className="box todo">
          <h3>✅ Da fare</h3>
          <ul>
            {data.action_items.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      {data.unclear_passages.length > 0 && (
        <section className="box unclear">
          <h3>⚠️ Da verificare</h3>
          <p className="hint">Passaggi poco chiari: l'AI non ne ha inventato il significato.</p>
          <ul>
            {data.unclear_passages.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </section>
      )}

      {data.corrections.length > 0 && (
        <details className="box corrections">
          <summary>✏️ Correzioni applicate ({data.corrections.length})</summary>
          <ul>
            {data.corrections.map((c, i) => (
              <li key={i}>
                <del>{c.original}</del> → <ins>{c.corrected}</ins> <small>({c.reason})</small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
