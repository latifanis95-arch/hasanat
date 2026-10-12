// Demandes « par thème » : la personne choisit un thème (espoir, la mort, la prière…), le kit choisit seul
// le passage dans la bibliothèque vérifiée (data/passages.json). Aucun verset n'est inventé : seulement des
// références relues, dont le texte vient de quran.com.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.ts";

export interface PassageInfo {
  id: string;
  ref: string;
  themes: string[];
  hook: { fr: string; en: string };
  formats?: string[];
  surligne?: Partial<Record<"fr" | "en", string>>;
  /** Format création : thèmes visuels par verset (ex. { "86": ["espace"] }). */
  montage?: Record<string, string[]>;
  /** Format création : où tombe le BAM (« 85 » ou « 190:3 »). */
  drop?: string;
  /** Nombre de mots arabes (≈ 1,2 à 1,6 s chacun selon le récitateur). */
  mots?: number;
}

export interface Sujet {
  id: string;
  fr: string;
  en: string;
}

export const loadSujets = (): Sujet[] => JSON.parse(fs.readFileSync(path.join(ROOT, "data", "sujets.json"), "utf8"));
export const loadPassages = (): PassageInfo[] => JSON.parse(fs.readFileSync(path.join(ROOT, "data", "passages.json"), "utf8"));

export function verseCount(ref: string): number {
  const m = /^\d+:(\d+)(?:-(\d+))?$/.exec(ref);
  return m ? Number(m[2] ?? m[1]) - Number(m[1]) + 1 : 0;
}

/** Un passage convient-il à ce format ? */
export function suits(p: PassageInfo, format: string, lang: "fr" | "en"): boolean {
  if (format === "surligne") return Boolean(p.surligne?.[lang]);
  // Format avec un BAM au 2e verset : il en faut au moins deux.
  if (format === "creation") return verseCount(p.ref) >= 2;
  return true;
}

/** Thèmes de la bibliothèque (ceux de data/sujets.json d'abord, puis les autres), avec leur nombre de passages. */
export function themesWithCounts(): Array<{ id: string; label: string; count: number }> {
  const passages = loadPassages();
  const counts = new Map<string, number>();
  for (const p of passages) for (const t of p.themes) counts.set(t, (counts.get(t) ?? 0) + 1);
  const labels = new Map(loadSujets().map((s) => [s.id, s.fr]));
  const known = loadSujets().map((s) => s.id).filter((id) => counts.has(id));
  const others = [...counts.keys()].filter((id) => !labels.has(id)).sort();
  return [...known, ...others].map((id) => ({ id, label: labels.get(id) ?? id, count: counts.get(id) ?? 0 }));
}

export function passagesFor(theme: string, format: string, lang: "fr" | "en"): PassageInfo[] {
  return loadPassages().filter((p) => p.themes.includes(theme) && suits(p, format, lang));
}
