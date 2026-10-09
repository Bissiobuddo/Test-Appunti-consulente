import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { OrganizedNoteSchema, type OrganizeRequest, type OrganizedNote } from "../shared/schema.ts";

const client = new Anthropic();

const SYSTEM = `Sei un assistente che trasforma trascrizioni di appunti vocali (spesso dettati in auto, con rumore di fondo) in appunti ordinati in italiano.

Regole sempre valide:
- Organizza il contenuto in sezioni con titoli e punti elenco concisi, raggruppando gli argomenti correlati anche se nel parlato erano sparsi.
- Correggi solo errori evidenti di trascrizione: parole fraintese dal riconoscimento vocale (omofoni, nomi propri storpiati quando il contesto rende chiara la forma giusta), punteggiatura, ripetizioni, intercalari ("ehm", "cioè", "praticamente"). Registra ogni correzione di parola in "corrections" (non serve per punteggiatura e intercalari).
- Non inventare mai fatti, nomi, numeri, date o importi. Se un passaggio è incomprensibile o ambiguo, non indovinare: riportalo in "unclear_passages".
- Mantieni il significato e il registro di chi parla. Cifre, importi e date vanno riportati esattamente come detti.
- Estrai in "action_items" le cose da fare menzionate esplicitamente.`;

const MODE_RULES: Record<OrganizeRequest["mode"], string> = {
  fedele:
    "Modalità FEDELE: usa solo informazioni presenti nella trascrizione. Ogni punto deve avere added_by_ai = false.",
  amplia:
    "Modalità AMPLIA: oltre a organizzare il contenuto, puoi aggiungere punti utili (spiegazioni di termini, passaggi logici impliciti, domande da approfondire, suggerimenti pratici). Ogni punto aggiunto deve avere added_by_ai = true; i punti che vengono dal parlato restano added_by_ai = false. Le aggiunte non devono mai contraddire o alterare quanto detto, né introdurre dati specifici (cifre, nomi, date) non pronunciati.",
};

export class RefusalError extends Error {}

export async function organizeNote(req: OrganizeRequest): Promise<OrganizedNote> {
  const extra = req.instructions?.trim()
    ? `\n\nIstruzioni aggiuntive dell'utente:\n${req.instructions.trim()}`
    : "";

  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(OrganizedNoteSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `${MODE_RULES[req.mode]}${extra}\n\n<trascrizione>\n${req.transcript}\n</trascrizione>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new RefusalError(response.stop_details?.explanation ?? "Richiesta rifiutata dal modello");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new Error("Risposta incompleta: la trascrizione potrebbe essere troppo lunga.");
  }
  return response.parsed_output;
}
