import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { OrganizedNoteSchema, type OrganizeRequest, type OrganizedNote } from "./schema.ts";
import { ORGANIZE_MODEL, ORGANIZE_SYSTEM, organizeUserMessage } from "./prompt.ts";

export class RefusalError extends Error {}

/**
 * Organizza una trascrizione con Claude. Usata dal server e, nell'app Android,
 * direttamente dal telefono (in quel caso il client ha la chiave dell'utente).
 */
export async function organizeNote(req: OrganizeRequest, client: Anthropic = new Anthropic()): Promise<OrganizedNote> {
  const response = await client.beta.messages.parse({
    model: ORGANIZE_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(OrganizedNoteSchema) },
    system: ORGANIZE_SYSTEM,
    messages: [{ role: "user", content: organizeUserMessage(req) }],
  });

  if (response.stop_reason === "refusal") {
    throw new RefusalError(response.stop_details?.explanation ?? "Richiesta rifiutata dal modello");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new Error("Risposta incompleta: la trascrizione potrebbe essere troppo lunga.");
  }
  return response.parsed_output;
}
