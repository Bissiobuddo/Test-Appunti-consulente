import { z } from "zod";

const Bullet = z.object({
  text: z.string().describe("Il contenuto del punto elenco"),
  added_by_ai: z
    .boolean()
    .describe("true SOLO se il contenuto non era presente nel parlato ed è stato aggiunto dall'AI"),
});

export const OrganizedNoteSchema = z.object({
  title: z.string().describe("Titolo breve e descrittivo degli appunti"),
  summary: z.string().describe("Sintesi in 1-3 frasi"),
  sections: z.array(
    z.object({
      heading: z.string(),
      bullets: z.array(
        Bullet.extend({
          sub_bullets: z.array(Bullet).describe("Dettagli del punto; lista vuota se non servono"),
        }),
      ),
    }),
  ),
  action_items: z.array(z.string()).describe("Cose da fare emerse dal parlato; lista vuota se nessuna"),
  corrections: z
    .array(
      z.object({
        original: z.string().describe("Testo come trascritto"),
        corrected: z.string().describe("Testo corretto"),
        reason: z.string().describe("Perché è stato corretto"),
      }),
    )
    .describe("Ogni correzione applicata rispetto alla trascrizione"),
  unclear_passages: z
    .array(z.string())
    .describe("Passaggi incomprensibili o ambigui lasciati da verificare, senza inventarne il significato"),
});

export type OrganizedNote = z.infer<typeof OrganizedNoteSchema>;

export type OrganizeMode = "fedele" | "amplia";

export interface OrganizeRequest {
  transcript: string;
  mode: OrganizeMode;
  instructions?: string;
}
