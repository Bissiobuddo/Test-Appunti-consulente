import { CATEGORY_IDS, type CategoryId, type CustomFeed } from "../../shared/sources.ts";
import { DEFAULT_MODEL, type ModelId } from "../../shared/schema.ts";

export interface AppSettings {
  /** Solo app Android: la chiave resta su questo dispositivo. */
  claudeKey: string;
  model: ModelId;
  maxStories: number;
  /** Categorie da preparare quando si aggiorna. */
  categories: CategoryId[];
  disabledSources: string[];
  customFeeds: CustomFeed[];
  speechRate: number;
  /** In auto legge anche punti chiave e cautele, non solo il riassunto. */
  readDetails: boolean;
  /** In auto spiega anche i termini del glossario. */
  readGlossary: boolean;
}

const KEY = "notizie-settings";
const DEFAULTS: AppSettings = {
  claudeKey: "",
  model: DEFAULT_MODEL,
  maxStories: 8,
  categories: [...CATEGORY_IDS],
  disabledSources: [],
  customFeeds: [],
  speechRate: 1,
  readDetails: false,
  readGlossary: false,
};

export function loadSettings(): AppSettings {
  try {
    const saved = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") } as AppSettings;
    saved.categories = saved.categories.filter((c) => CATEGORY_IDS.includes(c));
    return saved;
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // archiviazione non disponibile: le impostazioni valgono per questa sessione
  }
}
