// Morceaux de traduction à l'écran, phrase après phrase : le texte officiel découpé (jamais réécrit),
// calé sur la phrase arabe récitée. Des phrases voisines qui partagent le même morceau forment un seul bloc.
import type { TimedAyah, TimedWord } from "../script.ts";

export interface TranslationBlock {
  from: number;
  to: number;
  text: string;
  ayah: TimedAyah;
  /** Mots arabes récités pendant ce bloc. */
  words: TimedWord[];
}

export function translationBlocks(ayat: TimedAyah[]): TranslationBlock[] {
  const blocks: TranslationBlock[] = [];
  for (const ayah of ayat) {
    for (const phrase of ayah.phrases) {
      const text = phrase.translation ?? ayah.translation;
      const last = blocks.at(-1);
      if (last && last.ayah === ayah && last.text === text) {
        last.to = phrase.showTo;
        last.words.push(...phrase.words);
        continue;
      }
      blocks.push({ from: phrase.showFrom, to: phrase.showTo, text, ayah, words: [...phrase.words] });
    }
  }
  return blocks;
}

/** Durée sous laquelle une ligne de traduction s'efface avant d'avoir pu être lue. */
const MIN_BLOCK = 1.2;

/**
 * Deux textes de blocs voisins mis bout à bout. Dans un même verset, un morceau commun (reprise du récitateur)
 * n'est écrit qu'une fois ; d'un verset à l'autre, les textes sont simplement enchaînés.
 */
function joinTexts(a: string, b: string, sameVerse: boolean): string {
  if (!sameVerse) return `${a} ${b}`;
  if (a.includes(b)) return a;
  if (b.includes(a)) return b;
  for (let k = Math.min(a.length, b.length) - 1; k > 0; k--) {
    if (b[k] === " " && a.endsWith(` ${b.slice(0, k)}`)) return `${a}${b.slice(k)}`;
  }
  return `${a} ${b}`;
}

/**
 * Formats à une seule ligne (POV tombe) : un bloc trop bref pour être lu (« Par le Temps ! », 0,7 s)
 * rejoint le suivant, ou le précédent s'il est le dernier. Les textes restent ceux de la traduction, mis bout à bout.
 */
export function mergeShortBlocks(blocks: TranslationBlock[], min = MIN_BLOCK): TranslationBlock[] {
  const out: TranslationBlock[] = [];
  // Le bloc d'avant absorbe toujours celui qui le suit (les blocs de `out` sont des copies).
  const absorb = (into: TranslationBlock, next: TranslationBlock) => {
    into.to = next.to;
    into.text = joinTexts(into.text, next.text, into.ayah.key === next.ayah.key);
    into.words.push(...next.words);
  };
  for (const block of blocks) {
    const last = out.at(-1);
    if (last && last.to - last.from < min) absorb(last, block);
    else out.push({ ...block, words: [...block.words] });
  }
  const tail = out.at(-1);
  if (out.length > 1 && tail && tail.to - tail.from < min) absorb(out[out.length - 2], out.pop()!);
  return out;
}

export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Espaces insécables de la typographie française (avant ? ! : ; » et après «), pour ne jamais isoler un signe. */
export function nbsp(text: string): string {
  // Une virgule ou un point isolés par une espace dans la traduction (« lève-toi , ») restent collés au mot d'avant.
  return text.replace(/\s+([?!:;»])/g, " $1").replace(/\s+([,.])(?=\s|$)/g, " $1").replace(/«\s+/g, "« ");
}
