// Texte et traductions : uniquement depuis quran.com (texte uthmani vérifié).
// Aucun verset ni aucune traduction n'est jamais généré par une IA.
import { fetchJson } from "../lib/http.ts";

const API = "https://api.quran.com/api/v4";

export interface Chapter {
  id: number;
  nameArabic: string;
  nameSimple: string;
  translatedName: string;
  versesCount: number;
}

export interface QuranWord {
  /** Position du mot dans le verset (1 = premier mot), la même que dans le minutage audio. */
  position: number;
  text: string;
  /** Orthographe standard (imla'i) : sert à comparer avec une transcription. */
  imlaei: string;
}

export interface Verse {
  key: string;
  surah: number;
  ayah: number;
  words: QuranWord[];
  translation: string;
}

interface ApiChapter {
  chapter: {
    id: number;
    name_arabic: string;
    name_simple: string;
    verses_count: number;
    translated_name?: { name: string };
  };
}

interface ApiVerse {
  verse: {
    verse_key: string;
    words: Array<{ position: number; char_type_name: string; text_uthmani: string; text_imlaei?: string }>;
    translations?: Array<{ text: string }>;
  };
}

interface ApiTranslations {
  translations: Array<{ id: number; name: string; language_name: string }>;
}

export async function getChapter(id: number, lang: string): Promise<Chapter> {
  const { chapter } = await fetchJson<ApiChapter>(`${API}/chapters/${id}?language=${lang}`);
  return {
    id: chapter.id,
    nameArabic: chapter.name_arabic,
    nameSimple: chapter.name_simple,
    translatedName: chapter.translated_name?.name ?? chapter.name_simple,
    versesCount: chapter.verses_count,
  };
}

export async function getVerse(surah: number, ayah: number, translationId: number | null): Promise<Verse> {
  const params = new URLSearchParams({
    words: "true",
    word_fields: "text_uthmani,text_imlaei,char_type_name,position",
  });
  if (translationId) params.set("translations", String(translationId));
  const { verse } = await fetchJson<ApiVerse>(`${API}/verses/by_key/${surah}:${ayah}?${params}`);
  return {
    key: verse.verse_key,
    surah,
    ayah,
    // Le dernier « mot » renvoyé par l'API est le numéro du verset : on le retire.
    words: verse.words
      .filter((w) => w.char_type_name === "word")
      // « ۞ » marque un quart de hizb dans le mushaf : il n'est pas récité, on ne l'affiche pas.
      .map((w) => ({ position: w.position, text: w.text_uthmani.replace(/\u06DE\s*/g, "").trim(), imlaei: w.text_imlaei ?? w.text_uthmani })),
    translation: cleanTranslation(verse.translations?.[0]?.text ?? ""),
  };
}

export async function getTranslationName(id: number): Promise<string> {
  const { translations } = await fetchJson<ApiTranslations>(`${API}/resources/translations`);
  return translations.find((t) => t.id === id)?.name ?? `Traduction #${id}`;
}

/** Retire les appels de notes et le HTML que quran.com insère dans certaines traductions. */
export function cleanTranslation(html: string): string {
  return html
    .replace(/<sup[^>]*>.*?<\/sup>/gis, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
