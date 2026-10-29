export const CATEGORIES = [
  { id: "italia", label: "Italia" },
  { id: "mondo", label: "Mondo" },
  { id: "economia", label: "Economia" },
  { id: "tecnologia", label: "Tecnologia" },
  { id: "scienza", label: "Scienza e salute" },
  { id: "cultura", label: "Cultura e spettacoli" },
  { id: "sport", label: "Sport" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as CategoryId[];

export const categoryLabel = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

export function isCategory(value: unknown): value is CategoryId {
  return typeof value === "string" && (CATEGORY_IDS as string[]).includes(value);
}

/** Il tipo di testata aiuta l'AI (e chi legge) a pesare le fonti. */
export type SourceKind = "agenzia" | "servizio-pubblico" | "quotidiano" | "testata-online" | "internazionale" | "personalizzata";

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  agenzia: "agenzia di stampa",
  "servizio-pubblico": "servizio pubblico",
  quotidiano: "quotidiano nazionale",
  "testata-online": "testata online",
  internazionale: "testata internazionale",
  personalizzata: "fonte aggiunta da te",
};

export interface Source {
  id: string;
  name: string;
  kind: SourceKind;
  /** Uno o più feed RSS/Atom per categoria. */
  feeds: Partial<Record<CategoryId, string[]>>;
}

/** Feed aggiunto dall'utente nelle impostazioni. */
export interface CustomFeed {
  name: string;
  url: string;
  category: CategoryId;
}

// Feed pubblici delle principali testate. Se un indirizzo smette di funzionare
// l'app lo salta e lo segnala; si può sempre aggiungere un feed dalle impostazioni.
export const SOURCES: Source[] = [
  {
    id: "ansa",
    name: "ANSA",
    kind: "agenzia",
    feeds: {
      italia: ["https://www.ansa.it/sito/notizie/politica/politica_rss.xml", "https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml"],
      mondo: ["https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml"],
      economia: ["https://www.ansa.it/sito/notizie/economia/economia_rss.xml"],
      tecnologia: ["https://www.ansa.it/sito/notizie/tecnologia/tecnologia_rss.xml"],
      scienza: ["https://www.ansa.it/canale_scienza/notizie/scienza_rss.xml", "https://www.ansa.it/canale_saluteebenessere/notizie/saluteebenessere_rss.xml"],
      cultura: ["https://www.ansa.it/sito/notizie/cultura/cultura_rss.xml"],
      sport: ["https://www.ansa.it/sito/notizie/sport/sport_rss.xml"],
    },
  },
  {
    id: "agi",
    name: "AGI",
    kind: "agenzia",
    feeds: {
      italia: ["https://www.agi.it/politica/rss", "https://www.agi.it/cronaca/rss"],
      mondo: ["https://www.agi.it/estero/rss"],
      economia: ["https://www.agi.it/economia/rss"],
      tecnologia: ["https://www.agi.it/innovazione/rss"],
      scienza: ["https://www.agi.it/scienza/rss"],
      cultura: ["https://www.agi.it/cultura/rss"],
      sport: ["https://www.agi.it/sport/rss"],
    },
  },
  {
    id: "rainews",
    name: "Rai News",
    kind: "servizio-pubblico",
    feeds: {
      italia: ["https://www.rainews.it/rss/politica", "https://www.rainews.it/rss/cronaca"],
      mondo: ["https://www.rainews.it/rss/esteri"],
      economia: ["https://www.rainews.it/rss/economia"],
      tecnologia: ["https://www.rainews.it/rss/tecnologia"],
      scienza: ["https://www.rainews.it/rss/scienza"],
      cultura: ["https://www.rainews.it/rss/cultura"],
      sport: ["https://www.rainews.it/rss/sport"],
    },
  },
  {
    id: "corriere",
    name: "Corriere della Sera",
    kind: "quotidiano",
    feeds: {
      italia: ["https://xml2.corriereobjects.it/rss/politica.xml", "https://xml2.corriereobjects.it/rss/cronache.xml"],
      mondo: ["https://xml2.corriereobjects.it/rss/esteri.xml"],
      economia: ["https://xml2.corriereobjects.it/rss/economia.xml"],
      tecnologia: ["https://xml2.corriereobjects.it/rss/tecnologia.xml"],
      scienza: ["https://xml2.corriereobjects.it/rss/scienze.xml", "https://xml2.corriereobjects.it/rss/salute.xml"],
      cultura: ["https://xml2.corriereobjects.it/rss/cultura.xml", "https://xml2.corriereobjects.it/rss/spettacoli.xml"],
      sport: ["https://xml2.corriereobjects.it/rss/sport.xml"],
    },
  },
  {
    id: "repubblica",
    name: "la Repubblica",
    kind: "quotidiano",
    feeds: {
      italia: ["https://www.repubblica.it/rss/politica/rss2.0.xml", "https://www.repubblica.it/rss/cronaca/rss2.0.xml"],
      mondo: ["https://www.repubblica.it/rss/esteri/rss2.0.xml"],
      economia: ["https://www.repubblica.it/rss/economia/rss2.0.xml"],
      tecnologia: ["https://www.repubblica.it/rss/tecnologia/rss2.0.xml"],
      scienza: ["https://www.repubblica.it/rss/scienze/rss2.0.xml", "https://www.repubblica.it/rss/salute/rss2.0.xml"],
      cultura: ["https://www.repubblica.it/rss/spettacoli/rss2.0.xml"],
      sport: ["https://www.repubblica.it/rss/sport/rss2.0.xml"],
    },
  },
  {
    id: "sole24ore",
    name: "Il Sole 24 Ore",
    kind: "quotidiano",
    feeds: {
      italia: ["https://www.ilsole24ore.com/rss/italia.xml"],
      mondo: ["https://www.ilsole24ore.com/rss/mondo.xml"],
      economia: ["https://www.ilsole24ore.com/rss/economia.xml", "https://www.ilsole24ore.com/rss/finanza.xml"],
      tecnologia: ["https://www.ilsole24ore.com/rss/tecnologia.xml"],
      cultura: ["https://www.ilsole24ore.com/rss/cultura.xml"],
    },
  },
  {
    id: "ilpost",
    name: "Il Post",
    kind: "testata-online",
    feeds: {
      italia: ["https://www.ilpost.it/italia/feed/", "https://www.ilpost.it/politica/feed/"],
      mondo: ["https://www.ilpost.it/mondo/feed/"],
      economia: ["https://www.ilpost.it/economia/feed/"],
      tecnologia: ["https://www.ilpost.it/tecnologia/feed/"],
      scienza: ["https://www.ilpost.it/scienza/feed/"],
      cultura: ["https://www.ilpost.it/cultura/feed/"],
      sport: ["https://www.ilpost.it/sport/feed/"],
    },
  },
  {
    id: "gazzetta",
    name: "La Gazzetta dello Sport",
    kind: "quotidiano",
    feeds: { sport: ["https://www.gazzetta.it/rss/home.xml"] },
  },
  {
    id: "bbc",
    name: "BBC News",
    kind: "internazionale",
    feeds: {
      mondo: ["https://feeds.bbci.co.uk/news/world/rss.xml"],
      economia: ["https://feeds.bbci.co.uk/news/business/rss.xml"],
      tecnologia: ["https://feeds.bbci.co.uk/news/technology/rss.xml"],
      scienza: ["https://feeds.bbci.co.uk/news/science_and_environment/rss.xml"],
    },
  },
];

/** Una richiesta di feed già risolta: fonte + indirizzo. */
export interface FeedRef {
  sourceId: string;
  sourceName: string;
  kind: SourceKind;
  url: string;
}

/** Feed da leggere per una categoria, escluse le fonti disattivate e con quelli aggiunti dall'utente. */
export function feedsFor(category: CategoryId, disabledSources: string[] = [], custom: CustomFeed[] = []): FeedRef[] {
  const builtIn = SOURCES.filter((s) => !disabledSources.includes(s.id)).flatMap((s) =>
    (s.feeds[category] ?? []).map((url) => ({ sourceId: s.id, sourceName: s.name, kind: s.kind, url })),
  );
  const mine = custom
    .filter((f) => f.category === category && /^https?:\/\//i.test(f.url))
    .map((f) => ({ sourceId: `custom:${f.name}`, sourceName: f.name, kind: "personalizzata" as const, url: f.url }));
  return [...builtIn, ...mine];
}
