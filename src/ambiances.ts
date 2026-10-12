// Ambiances sonores (pluie, vagues, oiseaux…) glissées sous la récitation, à bas volume.
// Uniquement des enregistrements naturels en CC0 ou domaine public (Wikimedia Commons) : jamais de musique.
import fs from "node:fs";
import path from "node:path";
import { PATHS } from "./config.ts";
import { downloadFile, fetchJson } from "./lib/http.ts";
import { measureLoudness, probeDuration, run } from "./lib/proc.ts";

export interface Ambiance {
  id: string;
  label: string;
  /** false = trop agité pour un rappel calme (ex. orage). */
  calm: boolean;
  /** Titre du fichier sur Wikimedia Commons. */
  source: string;
  license: string;
  author: string;
  start: number;
  duration: number;
}

// Toutes les ambiances sont ramenées au même volume : le réglage de mixage vaut pour chacune.
const AMBIANCE_LUFS = -30;

/**
 * Ambiance accordée à l'image : la recherche du plan (ou le nom de la vidéo) dit ce qu'on voit.
 * Pluie derrière une vitre, vagues sur la mer, ruisseau près de l'eau, oiseaux en forêt ou au lever du jour ;
 * sinon une pluie légère, qui va avec tout.
 */
export function ambianceForScene(hint: string): string {
  const h = hint.toLowerCase();
  // Mots entiers : « summer » ne contient pas la mer, ni « street » un arbre, ni « rainbow » la pluie.
  const has = (words: string) => new RegExp(`\\b(?:${words})\\b`).test(h);
  if (has("windows?|vitres?")) return "pluie-vitre";
  if (has("rain|rainy|raining|rainfall|raindrops?|pluie|pluvieux")) return "pluie-douce";
  // Avant la mer : une mer de nuages (plan par défaut du format cinéma) est un lever du jour, pas une plage.
  // La nuit (lune, étoiles), pas d'oiseaux.
  if (
    has("clouds?|nuages?") &&
    !has("night|nuit|moon|lune|stars?|etoiles?") &&
    (/sea of clouds|mer de nuages/.test(h) || !has("oceans?|waves?|beach(?:es)?|underwater|coast(?:s|al)?|vagues?|mer"))
  )
    return "oiseaux-aube";
  if (has("seas?|oceans?|waves?|beach(?:es)?|underwater|coast(?:s|al)?|mer|vagues?")) return "vagues";
  if (has("rivers?|streams?|waterfalls?|creeks?|lakes?|cascades?|ruisseaux?|rivieres?")) return "ruisseau";
  if (has("sunrise|dawn|morning|aube")) return "oiseaux-aube";
  if (has("forests?|trees?|birds?|gardens?|valleys?|meadows?|jungles?|forets?|oiseaux?")) return "oiseaux";
  return "pluie-legere";
}
// Au réglage 0 dB, l'ambiance se place 12 dB sous la récitation, quel que soit le récitateur.
const BELOW_RECITATION_DB = 12;
const CROSSFADE_S = 2;

// Le « BAM » du format création : un vrai coup de tonnerre (claquement puis grondement), pas un effet synthétique.
const IMPACT = {
  id: "impact-tonnerre",
  label: "Coup de tonnerre (transition du format création)",
  source: "File:Thunderstorm after hot summer day 17 minutes 01 of 04.ogg",
  license: "Domaine public",
  author: "stephan",
  start: 159.62,
  duration: 4.2,
};

export function impactFile(): string {
  const file = path.join(PATHS.ambiances, `${IMPACT.id}.m4a`);
  if (!fs.existsSync(file)) throw new Error("Coup de tonnerre pas encore préparé : lance `npm run ambiances`.");
  return file;
}

interface ApiImageInfo {
  query: { pages: Record<string, { imageinfo?: Array<{ url: string; descriptionurl: string }> }> };
}

export function loadAmbiances(): Ambiance[] {
  return JSON.parse(fs.readFileSync(path.join(PATHS.data, "ambiances.json"), "utf8")) as Ambiance[];
}

export function ambianceFile(id: string): string {
  const ambiance = loadAmbiances().find((a) => a.id === id);
  if (!ambiance) throw new Error(`Ambiance inconnue « ${id} ». Voir \`npm run ambiances -- --liste\`.`);
  const file = path.join(PATHS.ambiances, `${id}.m4a`);
  if (!fs.existsSync(file)) throw new Error(`Ambiance « ${id} » pas encore préparée : lance \`npm run ambiances\`.`);
  return file;
}

/** Télécharge les enregistrements depuis Wikimedia Commons et prépare assets/ambiances/*.m4a. */
export async function prepareAmbiances(): Promise<void> {
  const ambiances = loadAmbiances();
  fs.mkdirSync(PATHS.ambiances, { recursive: true });
  const credits: string[] = [
    "# Crédits des ambiances",
    "",
    "Enregistrements naturels issus de Wikimedia Commons, en CC0 ou domaine public : utilisation libre, sans obligation de citer l'auteur. On les cite quand même.",
    "",
  ];
  for (const a of [...ambiances, { ...IMPACT, calm: false }]) {
    const params = new URLSearchParams({ action: "query", titles: a.source, prop: "imageinfo", iiprop: "url", format: "json" });
    const info = await fetchJson<ApiImageInfo>(`https://commons.wikimedia.org/w/api.php?${params}`);
    const image = Object.values(info.query.pages)[0]?.imageinfo?.[0];
    if (!image) throw new Error(`Fichier introuvable sur Commons : ${a.source}`);
    const out = path.join(PATHS.ambiances, `${a.id}.m4a`);
    credits.push(`- **${a.id}** — ${a.label}. ${a.author}, ${a.license}. ${image.descriptionurl}`);
    if (fs.existsSync(out) && fs.statSync(out).size > 0) {
      console.log(`✓ ${a.id.padEnd(14)} ${a.label} (déjà prête)`);
      continue;
    }
    const raw = await downloadFile(image.url, path.join(PATHS.cache, "ambiances", `${a.id}${path.extname(image.url)}`));
    await run("ffmpeg", [
      "-v", "error", "-y",
      "-ss", String(a.start), "-t", String(a.duration),
      "-i", raw,
      // Le tonnerre garde son attaque (pas de fondu d'entrée) ; les ambiances entrent et sortent en fondu.
      "-af", a.id === IMPACT.id
        ? `afade=t=out:st=${a.duration - 1.2}:d=1.2`
        : `loudnorm=I=${AMBIANCE_LUFS}:TP=-6:LRA=11,afade=t=in:d=1,areverse,afade=t=in:d=1,areverse`,
      "-ac", "2", "-ar", "44100", "-c:a", "aac", "-b:a", "160k",
      out,
    ]);
    console.log(`✓ ${a.id.padEnd(14)} ${a.label}`);
  }
  fs.writeFileSync(path.join(PATHS.ambiances, "CREDITS.md"), `${credits.join("\n")}\n`);
}

/**
 * Mélange récitation + ambiance sur toute la durée de la vidéo (carton final compris).
 * L'ambiance est bouclée en fondu si elle est trop courte, puis s'estompe à la fin.
 * gainDb ajuste son volume autour du niveau de référence (12 dB sous la récitation).
 */
export async function mixAmbiance(recitation: string, ambianceId: string, total: number, gainDb: number, dest: string, startAt = 0): Promise<void> {
  const ambiance = ambianceFile(ambianceId);
  const length = await probeDuration(ambiance);
  const volumeDb = (await measureLoudness(recitation)) - BELOW_RECITATION_DB + gainDb - AMBIANCE_LUFS;
  // startAt : l'ambiance n'arrive qu'à cet instant (au BAM, avec la nature), en fondu court.
  const span = total - startAt;
  const copies = Math.max(1, Math.ceil((span + CROSSFADE_S) / (length - CROSSFADE_S)));
  const inputs = Array.from({ length: copies }, () => ["-i", ambiance]).flat();
  const chain: string[] = [];
  let last = "1:a";
  for (let k = 1; k < copies; k++) {
    chain.push(`[${last}][${k + 1}:a]acrossfade=d=${CROSSFADE_S}[x${k}]`);
    last = `x${k}`;
  }
  const fadeOut = Math.min(2, span / 4);
  const delay = startAt > 0 ? `,adelay=${Math.round(startAt * 1000)}:all=1` : "";
  chain.push(
    `[${last}]atrim=0:${span.toFixed(3)},volume=${volumeDb.toFixed(1)}dB,afade=t=in:d=${startAt > 0 ? 0.3 : 1.5},afade=t=out:st=${(span - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}${delay}[amb]`,
    `[0:a]apad=whole_dur=${total.toFixed(3)}[rec]`,
    "[rec][amb]amix=inputs=2:duration=first:normalize=0[out]",
  );
  await run("ffmpeg", [
    "-v", "error", "-y",
    "-i", recitation, ...inputs,
    "-filter_complex", chain.join(";"),
    "-map", "[out]", "-ac", "2", "-ar", "44100", "-c:a", "aac", "-b:a", "192k",
    dest,
  ]);
}
