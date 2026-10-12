// Fonds de vidéo : un ciel étoilé généré (libre de droits, jamais deux fois le même, aucune clé nécessaire),
// une vidéo de ta bibliothèque `assets/backgrounds/`, ou une vidéo libre de droits trouvée sur Pixabay.
// Chaque plan Pixabay est vérifié (src/vetting.ts) : sans clé Gemini, seuls les plans déjà vérifiés sont utilisés.
import fs from "node:fs";
import path from "node:path";
import { PATHS, type Size, VIDEO } from "./config.ts";
import { geminiConfigured } from "./lib/gemini.ts";
import { downloadFile, fetchJson } from "./lib/http.ts";
import { probeDuration, run } from "./lib/proc.ts";
import { ARTIFICIAL, CATEGORIES, categoriesFor, EXCLUDED, isVerified, PEOPLE, plansFor } from "./plans.ts";
import { showsOnlyCreation } from "./vetting.ts";

export type Background =
  | { kind: "stars"; seed: number }
  /** hint : ce que montre le plan (mots-clés), pour accorder l'ambiance sonore quand Gemini n'est pas là. */
  | { kind: "video"; source: string; grade?: string; size?: { width: number; height: number }; hint?: string }
  /** Fond monté plan par plan (format création), écrit directement dans assets/background.mp4. */
  | { kind: "montage" };

const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm"]);

export function listLibrary(): string[] {
  if (!fs.existsSync(PATHS.backgrounds)) return [];
  return fs
    .readdirSync(PATHS.backgrounds)
    .filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()))
    .map((f) => path.join(PATHS.backgrounds, f));
}

export interface PixabayRendition {
  url: string;
  width: number;
  height: number;
  size: number;
}

export interface PixabayVideo {
  id: number;
  duration: number;
  tags: string;
  videos: Record<"large" | "medium" | "small" | "tiny", PixabayRendition>;
}

/** Les recherches Pixabay sont redemandées au bout d'une semaine (les plans par identifiant, jamais). */
export const PIXABAY_SEARCH_MAX_AGE = 7 * 24 * 3600 * 1000;

export function pixabayKey(): string {
  const key = process.env.PIXABAY_API_KEY?.trim();
  if (!key) throw new Error("Clé Pixabay absente : ajoute PIXABAY_API_KEY dans .env (gratuite : https://pixabay.com/api/docs/). Sans clé, utilise le ciel étoilé (fond par défaut).");
  return key;
}

/** Recherche de vidéos Pixabay (licence Pixabay : usage libre, sans mention obligatoire). */
export async function pixabaySearch(query: string, perPage = 50): Promise<PixabayVideo[]> {
  const params = new URLSearchParams({ key: pixabayKey(), q: query, video_type: "film", safesearch: "true", per_page: String(perPage) });
  const { hits } = await fetchJson<{ hits: PixabayVideo[] }>(`https://pixabay.com/api/videos/?${params}`, { maxAgeMs: PIXABAY_SEARCH_MAX_AGE });
  return hits;
}

/** Un plan précis par son identifiant (null s'il a été retiré de Pixabay). */
export async function pixabayById(id: number): Promise<PixabayVideo | null> {
  const params = new URLSearchParams({ key: pixabayKey(), id: String(id) });
  try {
    const { hits } = await fetchJson<{ hits: PixabayVideo[] }>(`https://pixabay.com/api/videos/?${params}`);
    return hits[0] ?? null;
  } catch {
    return null;
  }
}

/** Agrandissement nécessaire pour remplir le cadre (au-delà de 1, l'image devient floue). */
export function upscale(r: { width: number; height: number }, frame: Size): number {
  return Math.max(frame.width / r.width, frame.height / r.height);
}

/**
 * La plus grande version (4K de préférence : réduite, elle donne l'image la plus nette) qui ne dépasse pas `maxBytes` ;
 * renvoie aussi une version qu'il faudrait agrandir s'il n'y a rien de mieux (l'appelant décide).
 */
export function sharpestRendition(videos: Partial<Record<string, PixabayRendition>>, frame: Size, maxBytes = Number.POSITIVE_INFINITY): PixabayRendition | null {
  const all = Object.values(videos)
    .filter((r): r is PixabayRendition => Boolean(r?.url && r.width && r.height) && (r!.size ?? 0) <= maxBytes)
    .sort((a, b) => b.width * b.height - a.width * a.height);
  return all.find((r) => upscale(r, frame) <= 1.0) ?? all[0] ?? null;
}

/** Taille maximale d'un plan téléchargé (les plans 4K les plus lourds dépassent 300 Mo). */
const MAX_BYTES = 300 * 1024 * 1024;

/** Télécharge le plan dans le cache et vérifie qu'il ne montre que la création (sinon il est effacé). */
async function fetchChecked(hit: PixabayVideo, frame: Size, allowConstruction: boolean): Promise<string | null> {
  const rendition = sharpestRendition(hit.videos, frame, MAX_BYTES);
  if (!rendition) return null;
  let file: string;
  try {
    file = await downloadFile(rendition.url, path.join(PATHS.cache, "pixabay", `${hit.id}-${rendition.height}.mp4`));
  } catch (err) {
    console.log(`    (plan #${hit.id} indisponible : ${err instanceof Error ? err.message.split("\n")[0] : err})`);
    return null;
  }
  if (!(await showsOnlyCreation(file, hit.id, allowConstruction))) {
    fs.rmSync(file, { force: true });
    return null;
  }
  console.log(`  Fond Pixabay #${hit.id} ${rendition.width}×${rendition.height} (${hit.tags})`);
  return file;
}

/** Un plan parmi les plans déjà vérifiés de ces catégories (ordre fixé par la graine). */
async function verifiedVideo(categories: string[], seed: number, allowConstruction: boolean, frame: Size): Promise<{ file: string; tags: string }> {
  const ids = plansFor(categories, allowConstruction, seed);
  for (const id of ids.slice(0, 12)) {
    const hit = await pixabayById(id);
    if (!hit || hit.duration < 8 || PEOPLE.test(hit.tags) || EXCLUDED.test(hit.tags)) continue;
    const file = await fetchChecked(hit, frame, allowConstruction);
    if (file) return { file, tags: hit.tags };
  }
  throw new Error(`Aucun plan vérifié disponible pour « ${categories.join(", ") || "nature"} ». Réessaie avec --seed 2, ou garde le ciel étoilé.`);
}

/**
 * Cherche une vidéo sur Pixabay. Seuls les plans assez nets pour remplir le cadre sans agrandissement sont retenus
 * (4K pour recadrer un plan horizontal en vertical), ceux de la bonne orientation d'abord. Chaque candidate passe le
 * contrôle visuel. Sans clé Gemini, seuls les plans déjà vérifiés comptent ; s'il n'y en a aucun pour cette recherche,
 * un plan vérifié de la même catégorie (pluie, mer, montagne…) le remplace.
 */
export async function pixabayVideo(query: string, seed: number, allowConstruction = true, frame: Size = VIDEO): Promise<{ file: string; tags: string }> {
  // « #123456 » : un plan précis, choisi à l'œil sur Pixabay (il passe quand même le contrôle visuel).
  const byId = /^#?(\d+)$/.exec(query);
  if (byId) {
    const hit = await pixabayById(Number(byId[1]));
    if (!hit) throw new Error(`Plan Pixabay #${byId[1]} introuvable.`);
    if (PEOPLE.test(hit.tags) || EXCLUDED.test(hit.tags)) throw new Error(`Le plan #${hit.id} est écarté d'après ses mots-clés (${hit.tags}).`);
    if (!geminiConfigured() && !isVerified(hit.id, allowConstruction)) {
      throw new Error(`Le plan #${hit.id} n'a pas été vérifié. Sans clé Gemini, choisis un fond « nature » (voir npm run fonds).`);
    }
    const file = await fetchChecked(hit, frame, allowConstruction);
    if (!file) throw new Error(`Plan Pixabay #${hit.id} refusé ou indisponible.`);
    return { file, tags: hit.tags };
  }
  const hits = await pixabaySearch(query);
  const gemini = geminiConfigured();
  let usable = hits.filter((h) => h.duration >= 8 && sharpestRendition(h.videos, frame, MAX_BYTES) && !PEOPLE.test(h.tags) && !EXCLUDED.test(h.tags) && (allowConstruction || !ARTIFICIAL.test(h.tags)));
  if (!gemini) usable = usable.filter((h) => isVerified(h.id, allowConstruction));
  if (!usable.length) {
    const categories = categoriesFor(query);
    console.log(`  (aucun plan ${gemini ? "valable" : "déjà vérifié"} pour « ${query} » : plan vérifié de la catégorie ${categories.join(", ") || "nature"})`);
    return verifiedVideo(categories, seed, allowConstruction, frame);
  }
  const sharp = usable.filter((h) => upscale(sharpestRendition(h.videos, frame, MAX_BYTES)!, frame) <= 1.0);
  if (!sharp.length) console.log(`  (aucun plan assez net pour « ${query} » : qualité réduite)`);
  const landscape = frame.width > frame.height;
  const oriented = sharp.filter((h) => h.videos.large.width > h.videos.large.height === landscape);
  const pool = oriented.length >= 3 ? oriented : sharp.length ? sharp : usable;
  for (let k = 0; k < Math.min(pool.length, 6); k++) {
    const hit = pool[(seed + k) % pool.length];
    const file = await fetchChecked(hit, frame, allowConstruction);
    if (file) return { file, tags: hit.tags };
  }
  return verifiedVideo(categoriesFor(query), seed, allowConstruction, frame);
}

interface BackgroundOptions {
  /** Constructions permises dans un fond Pixabay (false = nature pure). */
  allowConstruction?: boolean;
  grade?: string;
  /** Taille du fond préparé (par défaut celle de l'image finale). */
  size?: Size;
  /** Taille de l'image finale : sert à exiger des plans assez nets. */
  frame?: Size;
}

/**
 * "stars" (ciel étoilé généré), "nature" ou "nature:<catégorie>" (plan vérifié : voir npm run fonds),
 * "pixabay:<recherche>", "random" (bibliothèque assets/backgrounds) ou un chemin de fichier.
 */
export async function resolveBackground(arg: string | undefined, seed: number, options: BackgroundOptions = {}): Promise<Background> {
  const look = { grade: options.grade, size: options.size ?? options.frame };
  const frame = options.size ?? options.frame;
  if (!arg || arg === "stars" || arg === "etoiles") return { kind: "stars", seed };
  if (arg === "nature" || arg.startsWith("nature:")) {
    const wanted = arg.includes(":") ? arg.slice(arg.indexOf(":") + 1).split(",").map((c) => c.trim()).filter(Boolean) : [];
    const unknown = wanted.filter((c) => !CATEGORIES[c]);
    if (unknown.length) throw new Error(`Catégorie de fond inconnue « ${unknown.join(", ")} ». Catégories : ${Object.keys(CATEGORIES).join(", ")}.`);
    const { file, tags } = await verifiedVideo(wanted, seed, options.allowConstruction ?? false, frame ?? VIDEO);
    return { kind: "video", source: file, hint: `${wanted.join(" ")} ${tags}`, ...look };
  }
  if (arg.startsWith("pixabay:")) {
    const query = arg.slice("pixabay:".length).trim();
    const { file, tags } = await pixabayVideo(query, seed, options.allowConstruction ?? true, frame);
    return { kind: "video", source: file, hint: `${query} ${tags}`, ...look };
  }
  if (arg === "random") {
    const library = listLibrary();
    if (!library.length) return { kind: "stars", seed };
    const source = library[seed % library.length];
    return { kind: "video", source, hint: path.basename(source), ...look };
  }
  const source = path.resolve(arg);
  if (!fs.existsSync(source)) throw new Error(`Fond introuvable : ${source}`);
  return { kind: "video", source, hint: path.basename(source), ...look };
}

/**
 * Un plan un peu trop court est légèrement ralenti (jusqu'à 1,4×) plutôt que bouclé : pas de saut visible.
 * Renvoie le filtre de vitesse à placer en tête de chaîne ffmpeg (vide si inutile).
 */
export async function stretchFilter(source: string, duration: number): Promise<string> {
  const length = await probeDuration(source);
  const ratio = (duration + 0.1) / length;
  return ratio > 1 && ratio <= 1.4 ? `setpts=${ratio.toFixed(4)}*PTS,` : "";
}

/** Recadre en 9:16, boucle si la vidéo est trop courte, assombrit légèrement pour la lisibilité (ou selon `grade`). */
export async function prepareVideoBackground(
  source: string,
  dest: string,
  duration: number,
  grade = "eq=brightness=-0.05:saturation=0.9",
  size: { width: number; height: number } = VIDEO,
): Promise<void> {
  const { width, height } = size;
  const { fps } = VIDEO;
  const stretch = await stretchFilter(source, duration);
  await run("ffmpeg", [
    "-v", "error", "-y",
    "-stream_loop", "-1",
    "-i", source,
    "-t", duration.toFixed(3),
    "-vf", `${stretch}scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},setsar=1,fps=${fps},${grade}`,
    "-an",
    "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-pix_fmt", "yuv420p",
    dest,
  ]);
}

/** Générateur pseudo-aléatoire déterministe : même graine, même ciel (exigence du rendu image par image). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Star {
  id: string;
  x: number;
  y: number;
  size: number;
  opacityLow: number;
  opacityHigh: number;
  cycle: number;
  delay: number;
}

export interface Nebula {
  id: string;
  x: number;
  y: number;
  size: number;
  color: string;
  dx: number;
  dy: number;
  scale: number;
}

export function generateSky(seed: number): { stars: Star[]; nebulas: Nebula[] } {
  const rand = mulberry32(seed);
  const stars: Star[] = Array.from({ length: 150 }, (_, i) => {
    const big = rand() < 0.08;
    const low = 0.15 + rand() * 0.35;
    return {
      id: `s${i}`,
      x: rand() * VIDEO.width,
      y: rand() * VIDEO.height * 1.08,
      size: big ? 3 + rand() * 2.5 : 1 + rand() * 1.8,
      opacityLow: low,
      opacityHigh: Math.min(1, low + 0.35 + rand() * 0.4),
      cycle: 1.6 + rand() * 3.2,
      delay: rand() * 3,
    };
  });
  const palette = ["rgba(76, 96, 190, 0.34)", "rgba(120, 70, 160, 0.26)", "rgba(200, 160, 90, 0.16)"];
  const nebulas: Nebula[] = palette.map((color, i) => ({
    id: `n${i}`,
    x: 100 + rand() * 700,
    y: 150 + rand() * 1300,
    size: 700 + rand() * 500,
    color,
    dx: (rand() - 0.5) * 160,
    dy: (rand() - 0.5) * 200,
    scale: 1.1 + rand() * 0.25,
  }));
  return { stars, nebulas };
}
