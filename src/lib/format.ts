import type { Note, OrganizedNote } from "./types.ts";

const AI_MARK = " ✦";

/** Appunti organizzati → Markdown (i punti aggiunti dall'AI sono marcati con ✦). */
export function toMarkdown(note: Note): string {
  const o = note.organized;
  if (!o) return `# ${note.title}\n\n${note.transcript}\n`;
  const lines = [`# ${o.title}`, "", `_${o.summary}_`, ""];
  for (const s of o.sections) {
    lines.push(`## ${s.heading}`, "");
    for (const b of s.bullets) {
      lines.push(`- ${b.text}${b.added_by_ai ? AI_MARK : ""}`);
      for (const sb of b.sub_bullets) lines.push(`  - ${sb.text}${sb.added_by_ai ? AI_MARK : ""}`);
    }
    lines.push("");
  }
  if (o.action_items.length) {
    lines.push("## Da fare", "", ...o.action_items.map((a) => `- [ ] ${a}`), "");
  }
  if (o.unclear_passages.length) {
    lines.push("## Da verificare", "", ...o.unclear_passages.map((u) => `- ${u}`), "");
  }
  if (o.corrections.length) {
    lines.push("## Correzioni applicate", "", ...o.corrections.map((c) => `- "${c.original}" → "${c.corrected}" (${c.reason})`), "");
  }
  if (o.sections.some((s) => s.bullets.some((b) => b.added_by_ai || b.sub_bullets.some((x) => x.added_by_ai)))) {
    lines.push(`---`, `${AI_MARK.trim()} = contenuto aggiunto dall'AI, non presente nel parlato`, "");
  }
  return lines.join("\n");
}

/** Markdown semplificato per la mappa mentale: titolo → sezioni → punti → dettagli. */
export function toMindmapMarkdown(o: OrganizedNote): string {
  const lines = [`# ${o.title}`];
  for (const s of o.sections) {
    lines.push(`## ${s.heading}`);
    for (const b of s.bullets) {
      lines.push(`- ${b.text}${b.added_by_ai ? AI_MARK : ""}`);
      for (const sb of b.sub_bullets) lines.push(`  - ${sb.text}${sb.added_by_ai ? AI_MARK : ""}`);
    }
  }
  if (o.action_items.length) {
    lines.push("## Da fare", ...o.action_items.map((a) => `- ${a}`));
  }
  return lines.join("\n");
}

export interface TreeNode {
  text: string;
  children: TreeNode[];
}

export function toTree(o: OrganizedNote): TreeNode {
  const leaf = (text: string, ai: boolean, children: TreeNode[] = []) => ({ text: text + (ai ? AI_MARK : ""), children });
  const children = o.sections.map((s) => ({
    text: s.heading,
    children: s.bullets.map((b) => leaf(b.text, b.added_by_ai, b.sub_bullets.map((sb) => leaf(sb.text, sb.added_by_ai)))),
  }));
  if (o.action_items.length) children.push({ text: "Da fare", children: o.action_items.map((a) => leaf(a, false)) });
  return { text: o.title, children };
}

export function toPlainText(note: Note): string {
  return toMarkdown(note)
    .replace(/^#+ /gm, "")
    .replace(/^(\s*)- \[ \] /gm, "$1☐ ")
    .replace(/^(\s*)- /gm, "$1• ")
    .replace(/^_(.*)_$/gm, "$1");
}
