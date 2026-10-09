import { createStore, del, get, set, values } from "idb-keyval";
import type { Note } from "./types.ts";

// Gli appunti restano sul dispositivo (IndexedDB): funzionano anche offline.
const store = createStore("appunti-vocali", "notes");

export async function listNotes(): Promise<Note[]> {
  const all = await values<Note>(store);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getNote = (id: string) => get<Note>(id, store);
export const saveNote = (note: Note) => set(note.id, note, store);
export const deleteNote = (id: string) => del(id, store);

export function newNote(transcript = ""): Note {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    title: `Appunto del ${new Date(now).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}`,
    transcript,
  };
}
