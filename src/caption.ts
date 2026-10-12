// Légende prête à coller sur TikTok / Instagram / YouTube Shorts.
import type { VideoScript } from "./script.ts";

const HASHTAGS = {
  fr: ["#coran", "#quran", "#islam", "#rappel", "#muslim", "#recitation", "#pourtoi", "#fyp"],
  en: ["#quran", "#islam", "#muslim", "#reminder", "#quranrecitation", "#allah", "#fyp", "#foryou"],
};

const tag = (text: string) => `#${text.normalize("NFD").replace(/[^A-Za-z0-9]/g, "").toLowerCase()}`;

export function buildCaption(script: VideoScript, hook?: string): string {
  const { chapter, reciter, lang } = script;
  const range = script.from === script.to ? `${script.from}` : `${script.from}-${script.to}`;
  // Récitateur sans nom : ni ligne « Récitation », ni hashtag vide.
  const tags = [...HASHTAGS[lang], tag(chapter.nameSimple), ...(reciter.name ? [tag(reciter.name)] : [])].join(" ");
  if (lang === "en") {
    return [
      hook ?? "Listen with your heart 🤍",
      "",
      `📖 Surah ${chapter.nameSimple} (${chapter.translatedName}) · ${range}`,
      ...(reciter.name ? [`🎙️ Recitation: ${reciter.name}`] : []),
      `📝 Translation: ${script.translationName}`,
      "",
      "Share it: “Whoever guides someone to goodness will have a reward like the one who does it.” (Sahih Muslim 1893)",
      "",
      tags,
    ].join("\n");
  }
  return [
    hook ?? "Écoute avec ton cœur 🤍",
    "",
    `📖 Sourate ${chapter.nameSimple} (${chapter.translatedName}) · ${script.from === script.to ? "verset" : "versets"} ${range}`,
    ...(reciter.name ? [`🎙️ Récitation : ${reciter.name}`] : []),
    `📝 Traduction : ${script.translationName}`,
    "",
    "Partage : « Celui qui indique un bien a la même récompense que celui qui le fait. » (Muslim, n° 1893)",
    "",
    tags,
  ].join("\n");
}
