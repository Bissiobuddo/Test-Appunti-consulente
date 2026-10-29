import { createStore, del, entries, get, set } from "idb-keyval";
import type { CategoryId } from "../../shared/sources.ts";
import type { CategoryDigest, Explanation } from "../../shared/schema.ts";
import type { WikiTerm } from "../../shared/wikipedia.ts";

// La rassegna resta sul dispositivo (IndexedDB): si può riaprire e ascoltare anche senza rete.
const store = createStore("notizie-chiare", "data");

export type Digests = Partial<Record<CategoryId, CategoryDigest>>;

export const loadDigests = async () => (await get<Digests>("digests", store)) ?? {};
export const saveDigests = (d: Digests) => set("digests", d, store);

/** Spiegazione e domande su una notizia, salvate per non rifare la richiesta all'AI. */
export interface StoryExtras {
  explanation?: Explanation;
  /** Modalità senza AI: voci di Wikipedia su nomi e sigle. */
  wiki?: WikiTerm[];
  qa: { question: string; answer: string }[];
}

export const storyKey = (d: CategoryDigest, index: number) => `extra:${d.category}:${d.generatedAt}:${index}`;

export const loadExtras = async (key: string): Promise<StoryExtras> => (await get<StoryExtras>(key, store)) ?? { qa: [] };
export const saveExtras = (key: string, extras: StoryExtras) => set(key, extras, store);

/** Elimina spiegazioni di notizie non più presenti nella rassegna. */
export async function pruneExtras(digests: Digests) {
  const alive = new Set(Object.values(digests).map((d) => `extra:${d.category}:${d.generatedAt}:`));
  for (const [key] of await entries<string, unknown>(store)) {
    if (key.startsWith("extra:") && ![...alive].some((prefix) => key.startsWith(prefix))) await del(key, store);
  }
}
