import type { OrganizedNote, OrganizeMode } from "../../shared/schema.ts";

export type { OrganizedNote, OrganizeMode };

export interface Note {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  transcript: string;
  organized?: OrganizedNote;
  organizedMode?: OrganizeMode;
}
