// Construit le « script » d'une vidéo : l'audio découpé et, pour chaque mot,
// l'instant exact où le récitateur le prononce. Tous les formats partent de là.
import fs from "node:fs";
import path from "node:path";
import type { Lang } from "./config.ts";
import { run } from "./lib/proc.ts";
import { type Chapter, getChapter, getTranslationName, getVerse, type Verse } from "./quran/api.ts";
import { cutAudio, downloadSurahAudio, getSurahAudio, type VerseTiming } from "./quran/audio.ts";
import type { Reciter } from "./quran/reciters.ts";
import { splitTranslation } from "./quran/translation-sync.ts";

export interface TimedWord {
  id: string;
  text: string;
  /** Secondes depuis le début de la vidéo. */
  start: number;
  end: number;
}

export interface Phrase {
  id: string;
  words: TimedWord[];
  /** Fenêtre d'affichage à l'écran (secondes). */
  showFrom: number;
  showTo: number;
  /** Morceau de la traduction officielle qui correspond à cette phrase (découpée, jamais réécrite). */
  translation?: string;
}

export interface TimedAyah {
  id: string;
  key: string;
  ayah: number;
  phrases: Phrase[];
  translation: string;
  showFrom: number;
  showTo: number;
}

export interface VideoScript {
  chapter: Chapter;
  reciter: Reciter;
  lang: Lang;
  translationName: string;
  from: number;
  to: number;
  ayat: TimedAyah[];
  audioFile: string;
  /** Durée de l'extrait de récitation (secondes). */
  recitationDuration: number;
}

export interface ScriptRequest {
  surah: number;
  from: number;
  to: number;
  reciter: Reciter;
  lang: Lang;
  translationId: number;
  workDir: string;
}

// Signes de pause (waqf) du mushaf : on coupe la phrase affichée juste après.
const WAQF = /[ۖ-ۛ]/;
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

const MAX_LETTERS = 30; // au-delà, la phrase ne tient plus lisiblement à l'écran
const MAX_WORDS = 7;
const LEAD_S = 0.18; // la phrase apparaît un peu avant le premier mot

// Particules qui ouvrent souvent une proposition : bons endroits pour couper une longue phrase.
// Comparées sans voyelles ; « إ » (inna, idh…) reste distinct de « أ » (an, « que »).
const CLAUSE_OPENERS = new Set([
  "إن", "إنه", "إنهم", "إنها", "إنك", "إنا", "إني", "إنما", "إذ", "إذا", "ثم", "لقد", "قد", "قل", "ألا",
  "حتي", "كذلك", "يأيها", "ياأيها", "أولئك", "الذين", "لن", "لم", "بل", "كلا", "ربنا", "سبحنك",
]);
// Mots qui régissent le mot suivant : on ne coupe jamais juste après eux (« لَن | نَّدْعُوَا۟ »).
const BOUND_TO_NEXT = new Set([
  "لن", "لم", "لا", "ما", "من", "في", "علي", "إلي", "عن", "إن", "أن", "قد", "لقد", "يا", "إذ", "إذا", "بل",
  "ثم", "حتي", "كي", "لو", "ولا", "ولن", "ولم", "فلا", "ومن", "وما", "إلا", "قل", "وذا", "ذا",
]);
// « أَن / أَنَّ » (« que ») se rattache au verbe qui précède : on évite de couper juste avant.
const BOUND_TO_PREVIOUS = new Set(["أن", "أنه", "أنهم", "أنها", "أنك", "أنا", "أني"]);
// « إِلَّا » complète la négation qui précède : couper avant afficherait « لَآ إِلَـٰهَ » seul.
const NEVER_BEFORE = new Set(["إلا"]);

const PRE_ROLL_MS = 250;
const TAIL_MS = 700;

const lettersOf = (words: AbsWord[]) => words.reduce((sum, w) => sum + letterCount(w.text), 0);

export function letterCount(text: string): number {
  return text.replace(DIACRITICS, "").replace(/\s/g, "").length;
}

export interface AbsWord {
  text: string;
  startMs: number;
  endMs: number;
  /** Rang du mot dans le verset (0 = premier mot). */
  pos?: number;
}

/** Nombre de lettres d'une phrase (poids pour caler la traduction). */
export const phraseLetters = (words: Array<{ text: string }>) => letterCount(words.map((w) => w.text).join(""));

/** Associe chaque mot à son minutage ; comble les rares trous par interpolation. */
export function timeWords(verse: Verse, timing: VerseTiming | undefined): AbsWord[] {
  const byPosition = new Map<number, [number, number]>();
  for (const [position, start, end] of timing?.segments ?? []) {
    if (!byPosition.has(position)) byPosition.set(position, [start, end]);
  }
  const words: AbsWord[] = verse.words.map((w, i) => {
    const seg = byPosition.get(w.position);
    return { text: w.text, startMs: seg ? seg[0] : Number.NaN, endMs: seg ? seg[1] : Number.NaN, pos: i };
  });

  const verseFrom = timing?.fromMs ?? 0;
  const verseTo = timing?.toMs ?? verseFrom + words.length * 600;
  let i = 0;
  while (i < words.length) {
    if (!Number.isNaN(words[i].startMs)) {
      i++;
      continue;
    }
    let j = i;
    while (j < words.length && Number.isNaN(words[j].startMs)) j++;
    const left = i > 0 ? words[i - 1].endMs : verseFrom;
    const right = Math.max(left, j < words.length ? words[j].startMs : verseTo);
    const run = words.slice(i, j);
    const total = run.reduce((sum, w) => sum + Math.max(1, letterCount(w.text)), 0);
    let cursor = left;
    for (const w of run) {
      const d = ((right - left) * Math.max(1, letterCount(w.text))) / total;
      w.startMs = cursor;
      w.endMs = cursor + d;
      cursor += d;
    }
    i = j;
  }

  // Garantit un minutage croissant même si la source contient une incohérence.
  for (let k = 0; k < words.length; k++) {
    if (k > 0) words[k].startMs = Math.max(words[k].startMs, words[k - 1].startMs);
    words[k].endMs = Math.max(words[k].endMs, words[k].startMs + 80);
  }
  return words;
}

/** Forme sans voyelles pour comparer les mots (garde la distinction « إ » / « أ »). */
function bare(text: string): string {
  return text.replace(DIACRITICS, "").replace(/[ٱآ]/g, "ا").replace(/ى/g, "ي").replace(/\s/g, "");
}

/**
 * Le mot ouvre-t-il une proposition ? « وَ » / « فَ » de coordination ou particule courante.
 * « وَ » suivi de l'article (« وَٱلْأَرْضِ ») relie deux noms : ce n'est pas une nouvelle proposition.
 */
function opensClause(text: string): boolean {
  if (/^[وف]\u064E/.test(text)) return !linksNouns(text);
  return CLAUSE_OPENERS.has(bare(text));
}

function linksNouns(text: string): boolean {
  return /^[وف]\u064E[ٱا]ل/.test(text);
}

/** Mot anormalement long pour sa taille : le récitateur a marqué une pause à la fin. */
function endsWithBreath(word: AbsWord): boolean {
  return word.endMs - word.startMs > 2 * (letterCount(word.text) * 120 + 150);
}

/** Note d'une coupure entre words[k - 1] et words[k] : plus elle est haute, plus la coupure est naturelle. */
function cutScore(words: AbsWord[], k: number, leftLetters: number, half: number): number {
  const before = words[k - 1];
  const after = words[k];
  let score = 2 * (1 - Math.abs(leftLetters - half) / half); // deux moitiés équilibrées
  if (opensClause(after.text)) score += 1.5;
  // Indice faible : un mot long peut aussi venir d'un allongement (madd) récité sans pause.
  if (endsWithBreath(before)) score += 0.5;
  score += Math.min(600, Math.max(0, after.startMs - before.endMs)) / 300; // vrai silence du récitateur
  if (BOUND_TO_NEXT.has(bare(before.text))) score -= 3;
  if (BOUND_TO_PREVIOUS.has(bare(after.text))) score -= 0.5;
  if (NEVER_BEFORE.has(bare(after.text))) score -= 10;
  if (linksNouns(after.text)) score -= 1.5;
  return score;
}

/** Coupe récursivement une phrase trop longue à l'endroit le plus naturel. */
function splitLong(words: AbsWord[]): AbsWord[][] {
  if (words.length <= MAX_WORDS && lettersOf(words) <= MAX_LETTERS) return [words];
  const half = lettersOf(words) / 2;
  let best = 1;
  let bestScore = Number.NEGATIVE_INFINITY;
  let left = 0;
  for (let k = 1; k < words.length; k++) {
    left += letterCount(words[k - 1].text);
    const score = cutScore(words, k, left, half);
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return [...splitLong(words.slice(0, best)), ...splitLong(words.slice(best))];
}

/**
 * Découpe un verset en phrases affichables : d'abord aux signes de pause du mushaf,
 * puis les passages trop longs à l'endroit le plus naturel.
 */
export function splitPhrases(words: AbsWord[]): AbsWord[][] {
  const groups: AbsWord[][] = [];
  let current: AbsWord[] = [];
  for (const word of words) {
    current.push(word);
    if (WAQF.test(word.text)) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  const phrases = groups.flatMap(splitLong);

  // Un mot isolé rejoint une voisine : la précédente si rien ne les sépare, sinon la suivante.
  const merged: AbsWord[][] = [];
  for (let i = 0; i < phrases.length; i++) {
    const phrase = phrases[i];
    const prev = merged.at(-1);
    const next = phrases[i + 1];
    if (phrase.length === 1) {
      const word = phrase[0];
      const prevOpen = prev && !WAQF.test(prev.at(-1)!.text) && !opensClause(word.text);
      if (prev && prevOpen && lettersOf(prev) + lettersOf(phrase) <= MAX_LETTERS + 4) {
        prev.push(word);
        continue;
      }
      if (next && !WAQF.test(word.text) && lettersOf(next) + lettersOf(phrase) <= MAX_LETTERS + 4) {
        next.unshift(word);
        continue;
      }
    }
    merged.push(phrase);
  }
  return merged;
}

/**
 * Coupe les `cut` premières secondes d'une récitation (audio et minutage) : sert à raccourcir l'intro étouffée
 * avant le BAM. Les phrases entièrement coupées disparaissent ; les versets annoncés suivent ce qui reste.
 */
export async function trimScriptStart(script: VideoScript, cut: number, workDir: string): Promise<VideoScript> {
  const audioFile = path.join(workDir, "recitation-raccourcie.m4a");
  fs.mkdirSync(workDir, { recursive: true });
  await run("ffmpeg", ["-v", "error", "-y", "-ss", cut.toFixed(3), "-i", script.audioFile, "-af", "afade=t=in:d=0.12", "-c:a", "aac", "-b:a", "192k", audioFile]);
  const shift = (t: number) => Math.max(0, Math.round((t - cut) * 1000) / 1000);
  const ayat = script.ayat
    .map((a) => ({
      ...a,
      phrases: a.phrases
        .filter((p) => p.showTo > cut + 0.01)
        .map((p) => ({
          ...p,
          showFrom: shift(p.showFrom),
          showTo: shift(p.showTo),
          words: p.words.map((w) => ({ ...w, start: shift(w.start), end: shift(w.end) })),
        })),
    }))
    .filter((a) => a.phrases.length)
    .map((a) => ({ ...a, showFrom: a.phrases[0].showFrom, showTo: a.phrases.at(-1)!.showTo }));
  const numbers = ayat.map((a) => a.ayah);
  return { ...script, ayat, audioFile, recitationDuration: script.recitationDuration - cut, from: Math.min(...numbers), to: Math.max(...numbers) };
}

/**
 * Fait précéder la récitation de ses `seconds` premières secondes (l'intro les fera entendre étouffées) :
 * le BAM peut alors tomber sur le tout premier verset, qui revient à plein volume.
 */
export async function prependEcho(script: VideoScript, seconds: number, workDir: string): Promise<VideoScript> {
  const audioFile = path.join(workDir, "recitation-echo.m4a");
  fs.mkdirSync(workDir, { recursive: true });
  await run("ffmpeg", [
    "-v", "error", "-y", "-i", script.audioFile,
    "-filter_complex",
    `[0:a]asplit=2[a][b];[a]atrim=0:${seconds.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=out:st=${(seconds - 0.08).toFixed(3)}:d=0.08[echo];[b]asetpts=PTS-STARTPTS[full];[echo][full]concat=n=2:v=0:a=1[out]`,
    "-map", "[out]", "-c:a", "aac", "-b:a", "192k", audioFile,
  ]);
  const shift = (t: number) => Math.round((t + seconds) * 1000) / 1000;
  const ayat = script.ayat.map((a) => ({
    ...a,
    showFrom: shift(a.showFrom),
    showTo: shift(a.showTo),
    phrases: a.phrases.map((p) => ({
      ...p,
      showFrom: shift(p.showFrom),
      showTo: shift(p.showTo),
      words: p.words.map((w) => ({ ...w, start: shift(w.start), end: shift(w.end) })),
    })),
  }));
  return { ...script, ayat, audioFile, recitationDuration: script.recitationDuration + seconds };
}

/** Chaque phrase reste affichée jusqu'à l'arrivée de la suivante : l'écran n'est jamais vide. */
export function chainDisplay(ayat: TimedAyah[], total: number): void {
  const phrases = ayat.flatMap((a) => a.phrases);
  phrases.forEach((phrase, k) => {
    // La première phrase est à l'écran dès la première image (elle sert de couverture sur TikTok).
    phrase.showFrom = k === 0 ? 0 : phrases[k - 1].showTo;
    const nextPhrase = phrases[k + 1];
    phrase.showTo = nextPhrase ? Math.max(phrase.showFrom + 0.4, nextPhrase.words[0].start - LEAD_S) : total;
  });
  for (const ayah of ayat) {
    ayah.showFrom = ayah.phrases[0].showFrom;
    ayah.showTo = ayah.phrases.at(-1)!.showTo;
  }
}

/** Texte, traduction et minutage d'un passage (sans télécharger l'audio). */
async function loadPassage(req: Omit<ScriptRequest, "workDir">) {
  const chapter = await getChapter(req.surah, req.lang);
  if (req.from < 1 || req.to > chapter.versesCount || req.from > req.to) {
    throw new Error(`Versets invalides : la sourate ${chapter.nameSimple} a ${chapter.versesCount} versets.`);
  }
  const ayahNumbers = Array.from({ length: req.to - req.from + 1 }, (_, i) => req.from + i);
  const [verses, audio, translationName] = await Promise.all([
    Promise.all(ayahNumbers.map((a) => getVerse(req.surah, a, req.translationId))),
    getSurahAudio(req.reciter, req.surah),
    getTranslationName(req.translationId),
  ]);
  const timed = verses.map((verse) => ({ verse, words: timeWords(verse, audio.timings.get(verse.key)) }));
  return { chapter, audio, translationName, timed };
}

/** Aperçu du découpage à l'écran, verset par verset (commande `npm run phrases`). */
export async function previewPhrases(req: Omit<ScriptRequest, "workDir">): Promise<Array<{ key: string; phrases: string[] }>> {
  const { timed } = await loadPassage(req);
  return timed.map(({ verse, words }) => ({
    key: verse.key,
    phrases: splitPhrases(words).map((group) => group.map((w) => w.text).join(" ")),
  }));
}

export async function buildScript(req: ScriptRequest): Promise<VideoScript> {
  const { chapter, audio, translationName, timed } = await loadPassage(req);
  const surahFile = await downloadSurahAudio(req.reciter, req.surah, audio.url);

  // Fenêtre audio : du premier mot au dernier, sans déborder sur le verset suivant.
  const firstMs = timed[0].words[0].startMs;
  const lastMs = timed.at(-1)!.words.at(-1)!.endMs;
  const clipStartMs = Math.max(0, firstMs - PRE_ROLL_MS);
  let clipEndMs = lastMs + TAIL_MS;
  const next = audio.timings.get(`${req.surah}:${req.to + 1}`);
  if (next) {
    const nextStart = next.segments[0]?.[1] ?? next.fromMs;
    clipEndMs = Math.min(clipEndMs, nextStart - 60);
  }
  clipEndMs = Math.max(clipEndMs, lastMs + 120);

  fs.mkdirSync(req.workDir, { recursive: true });
  const audioFile = path.join(req.workDir, "recitation.m4a");
  await cutAudio(surahFile, audioFile, clipStartMs / 1000, clipEndMs / 1000);
  const recitationDuration = (clipEndMs - clipStartMs) / 1000;
  const toSec = (ms: number) => Math.round(ms - clipStartMs) / 1000;

  let wordId = 0;
  let phraseId = 0;
  const ayat: TimedAyah[] = timed.map(({ verse, words }, index) => {
    const groups = splitPhrases(words);
    const pieces = splitTranslation(verse.translation, groups.map(phraseLetters));
    return {
      id: `a${index}`,
      key: verse.key,
      ayah: verse.ayah,
      translation: verse.translation,
      showFrom: 0,
      showTo: 0,
      phrases: groups.map((group, k) => ({
        id: `p${phraseId++}`,
        showFrom: 0,
        showTo: 0,
        translation: pieces[k],
        words: group.map((w) => ({ id: `w${wordId++}`, text: w.text, start: toSec(w.startMs), end: toSec(w.endMs) })),
      })),
    };
  });

  chainDisplay(ayat, recitationDuration);

  return {
    chapter,
    reciter: req.reciter,
    lang: req.lang,
    translationName,
    from: req.from,
    to: req.to,
    ayat,
    audioFile,
    recitationDuration,
  };
}
