import type { Article } from "../../shared/feeds.ts";
import { categoryLabel, type CategoryId } from "../../shared/sources.ts";
import type { CategoryDigest, Reliability, Story } from "../../shared/schema.ts";

export const RELIABILITY_INFO: Record<Reliability, { label: string; hint: string; spoken: string }> = {
  confermata: {
    label: "Confermata",
    hint: "Più testate riportano gli stessi fatti",
    spoken: "Notizia confermata da più fonti.",
  },
  parziale: {
    label: "Parzialmente confermata",
    hint: "Fatto principale concorde, dettagli diversi o in evoluzione",
    spoken: "Le fonti concordano sul fatto principale, ma non su tutti i dettagli.",
  },
  fonte_unica: {
    label: "Fonte unica",
    hint: "La riporta una sola testata: da verificare",
    spoken: "La riporta una sola fonte, quindi va presa con cautela.",
  },
  contrastante: {
    label: "Versioni contrastanti",
    hint: "Le testate si contraddicono sui fatti principali",
    spoken: "Attenzione: le fonti danno versioni in contrasto.",
  },
};

export function storyArticles(story: Story, digest: CategoryDigest): Article[] {
  return story.article_ids.map((id) => digest.articles.find((a) => a.id === id)).filter((a): a is Article => Boolean(a));
}

/** Nomi delle testate, senza ripetizioni, nell'ordine in cui compaiono. */
export const sourceNames = (articles: Article[]) => [...new Set(articles.map((a) => a.sourceName))];

export function joinNames(names: string[]): string {
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
}

export interface ReadingOptions {
  readDetails: boolean;
  readGlossary: boolean;
}

export function spokenStory(story: Story, articles: Article[], opts: ReadingOptions): string {
  const parts = [`${story.title}.`, story.summary];
  if (opts.readDetails && story.key_points.length) parts.push(`In breve: ${story.key_points.join(". ")}.`);
  parts.push(`Fonti: ${joinNames(sourceNames(articles))}.`, RELIABILITY_INFO[story.reliability].spoken);
  if (opts.readDetails) parts.push(...story.caveats.map((c) => `Cautela: ${c}`));
  if (opts.readGlossary && story.glossary.length) {
    parts.push("Per capire meglio:", ...story.glossary.map((g) => `${g.term}: ${g.explanation}`));
  }
  return parts.join(" ").replace(/\.\./g, ".");
}

export interface ReadingItem {
  key: string;
  category: CategoryId;
  title: string;
  text: string;
}

/** Coda di lettura per la modalità auto, con annuncio della categoria quando cambia. */
export function readingQueue(digests: CategoryDigest[], filter: (s: Story) => boolean, opts: ReadingOptions): ReadingItem[] {
  const items: ReadingItem[] = [];
  for (const d of digests) {
    const stories = d.stories.map((s, i) => ({ s, i })).filter(({ s }) => filter(s));
    stories.forEach(({ s, i }, n) => {
      const intro = n === 0 ? `${categoryLabel(d.category)}. ` : "";
      items.push({ key: `${d.category}:${i}`, category: d.category, title: s.title, text: intro + spokenStory(s, storyArticles(s, d), opts) });
    });
  }
  if (items.length) {
    const today = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
    items[0] = { ...items[0], text: `Ecco le notizie di ${today}. ${items[0].text}` };
    const last = items.length - 1;
    items[last] = { ...items[last], text: `${items[last].text} Fine delle notizie.` };
  }
  return items;
}
