import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { jsPDF } from "jspdf";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { isNative } from "./platform.ts";
import { blobToBase64 } from "./base64.ts";
import { toMarkdown, toMindmapMarkdown, toPlainText, toTree, type TreeNode } from "./format.ts";
import type { Note } from "./types.ts";

function slug(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 60) || "appunti"
  );
}

const nameOf = (note: Note) => slug(note.organized?.title ?? note.title);

/** Condivide il file (menu di Android: Drive, WhatsApp, email…) o, se non possibile, lo scarica. */
export async function deliver(blob: Blob, filename: string) {
  if (isNative) {
    // Nell'app Android il file va scritto nella cache e poi passato al menu Condividi di sistema.
    const { uri } = await Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: Directory.Cache });
    try {
      await Share.share({ title: filename, files: [uri] });
    } catch (err) {
      if (!(err instanceof Error && /cancel/i.test(err.message))) throw err;
    }
    return;
  }
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const exportMarkdown = (note: Note) =>
  deliver(new Blob([toMarkdown(note)], { type: "text/markdown" }), `${nameOf(note)}.md`);

export const exportText = (note: Note) =>
  deliver(new Blob([toPlainText(note)], { type: "text/plain" }), `${nameOf(note)}.txt`);

export async function exportDocx(note: Note) {
  const o = note.organized;
  const children: Paragraph[] = [];
  const bullet = (text: string, ai: boolean, level: number) =>
    new Paragraph({
      bullet: { level },
      children: [new TextRun(text), ...(ai ? [new TextRun({ text: " ✦", color: "7C3AED" })] : [])],
    });

  if (!o) {
    children.push(new Paragraph({ text: note.title, heading: HeadingLevel.TITLE }));
    note.transcript.split(/\n+/).forEach((p) => children.push(new Paragraph(p)));
  } else {
    children.push(new Paragraph({ text: o.title, heading: HeadingLevel.TITLE }));
    children.push(new Paragraph({ children: [new TextRun({ text: o.summary, italics: true })] }));
    for (const s of o.sections) {
      children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1 }));
      for (const b of s.bullets) {
        children.push(bullet(b.text, b.added_by_ai, 0));
        b.sub_bullets.forEach((sb) => children.push(bullet(sb.text, sb.added_by_ai, 1)));
      }
    }
    const list = (heading: string, items: string[]) => {
      if (!items.length) return;
      children.push(new Paragraph({ text: heading, heading: HeadingLevel.HEADING_1 }));
      items.forEach((t) => children.push(bullet(t, false, 0)));
    };
    list("Da fare", o.action_items);
    list("Da verificare", o.unclear_passages);
    list("Correzioni applicate", o.corrections.map((c) => `"${c.original}" → "${c.corrected}" (${c.reason})`));
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: "✦ = contenuto aggiunto dall'AI", size: 16, color: "666666" })],
      }),
    );
  }
  const doc = new Document({ creator: "Appunti Vocali AI", title: o?.title ?? note.title, sections: [{ children }] });
  await deliver(await Packer.toBlob(doc), `${nameOf(note)}.docx`);
}

export async function exportPdf(note: Note) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 18;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const bottom = pdf.internal.pageSize.getHeight() - margin;
  let y = margin;

  // I font standard di jsPDF non hanno ✦ e ☐: si usano equivalenti ASCII.
  const write = (text: string, size: number, style: "normal" | "bold" | "italic" = "normal", indent = 0) => {
    pdf.setFont("helvetica", style).setFontSize(size);
    const lines = pdf.splitTextToSize(text.replace(/✦/g, "(AI)").replace(/☐/g, "[ ]"), width - indent) as string[];
    for (const line of lines) {
      if (y + size * 0.45 > bottom) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(line, margin + indent, y);
      y += size * 0.45;
    }
    y += size * 0.15;
  };

  for (const line of toPlainText(note).split("\n")) {
    if (!line.trim()) {
      y += 2;
      continue;
    }
    const isTitle = line === (note.organized?.title ?? note.title);
    const isHeading = note.organized && (note.organized.sections.some((s) => s.heading === line) ||
      ["Da fare", "Da verificare", "Correzioni applicate"].includes(line));
    if (isTitle) write(line, 18, "bold");
    else if (isHeading) write(line, 13, "bold");
    else {
      const indent = (line.match(/^\s*/)?.[0].length ?? 0) * 3;
      write(line.trim(), 11, "normal", indent);
    }
  }
  await deliver(pdf.output("blob"), `${nameOf(note)}.pdf`);
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** FreeMind .mm: si apre con FreeMind, Freeplane, XMind, MindMeister, SimpleMind… */
export function exportFreeMind(note: Note) {
  if (!note.organized) return;
  const node = (n: TreeNode, depth: number): string =>
    `<node TEXT="${xmlEscape(n.text)}"${depth === 1 ? ' POSITION="right"' : ""}>${n.children.map((c) => node(c, depth + 1)).join("")}</node>`;
  const xml = `<map version="1.0.1">${node(toTree(note.organized), 0)}</map>`;
  return deliver(new Blob([xml], { type: "application/x-freemind" }), `${nameOf(note)}.mm`);
}

/** OPML: importabile in molte app di mappe mentali e outliner. */
export function exportOpml(note: Note) {
  if (!note.organized) return;
  const tree = toTree(note.organized);
  const outline = (n: TreeNode): string =>
    `<outline text="${xmlEscape(n.text)}">${n.children.map(outline).join("")}</outline>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>${xmlEscape(tree.text)}</title></head><body>${outline(tree)}</body></opml>`;
  return deliver(new Blob([xml], { type: "text/x-opml" }), `${nameOf(note)}.opml`);
}

/** Pagina HTML autonoma con la mappa mentale interattiva (markmap). */
export function exportMindmapHtml(note: Note) {
  if (!note.organized) return;
  const md = toMindmapMarkdown(note.organized).replace(/<\/script/gi, "<\\/script");
  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${xmlEscape(note.organized.title)}</title>
<style>html,body,.markmap{margin:0;height:100%;width:100%}</style>
<script src="https://cdn.jsdelivr.net/npm/markmap-autoloader@0.18.12"></script>
</head><body><div class="markmap"><script type="text/template">
${md}
</script></div></body></html>`;
  return deliver(new Blob([html], { type: "text/html" }), `${nameOf(note)}-mappa.html`);
}

export function exportSvg(svg: SVGSVGElement, note: Note) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const { width, height } = svg.getBoundingClientRect();
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(Math.round(width)));
  clone.setAttribute("height", String(Math.round(height)));
  // Colori fissi: il file esportato è sempre su sfondo bianco, anche se l'app è in modalità scura.
  clone.style.background = "#ffffff";
  clone.style.setProperty("--markmap-text-color", "#141625");
  clone.style.setProperty("--markmap-circle-open-bg", "#ffffff");
  clone.style.setProperty("--markmap-font", "500 15px/20px system-ui, sans-serif");
  const data = new XMLSerializer().serializeToString(clone);
  return deliver(new Blob([data], { type: "image/svg+xml" }), `${nameOf(note)}-mappa.svg`);
}
