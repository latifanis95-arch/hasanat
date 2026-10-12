// Format « création » : une intro sombre et étouffée, puis BAM (tonnerre + flash) et un montage
// rapide de la création d'Allah (espace, ciel, terre) en plans de 0,5 s, sous la récitation plein volume.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mulberry32, type PixabayRendition, type PixabayVideo, pixabayById, pixabaySearch, sharpestRendition, upscale } from "./backgrounds.ts";
import { PATHS, VIDEO } from "./config.ts";
import { geminiConfigured } from "./lib/gemini.ts";
import { downloadFile } from "./lib/http.ts";
import { measureLoudness, probeDuration, run } from "./lib/proc.ts";
import { ARTIFICIAL, categoriesFor, EXCLUDED, isVerified, PEOPLE, plansFor } from "./plans.ts";
import type { VideoScript } from "./script.ts";
import { dejaRefuse, showsOnlyCreation } from "./vetting.ts";

export type MontageStyle = "creation";

interface MontageConfig {
  intro: string[];
  /** « sombre » : ralenti et presque noir et blanc ; « choc » : vitesse réelle, contrasté. */
  introStyle: "sombre" | "choc";
  /** L'intro peut-elle montrer une construction (clôture, route…) ? Les plans du montage, jamais. */
  introAllowConstruction: boolean;
  /** Plans Pixabay imposés pour l'intro, sinon recherche sur `intro`. */
  introIds?: number[];
  themes: Record<string, string[]>;
  clipsPerQuery: number;
  defaultThemes: string[];
  /** Durée d'un plan après le BAM (secondes). */
  cut: number;
  /** Durée des derniers plans : les coupes accélèrent de `cut` à `cutEnd` (sinon rythme constant). */
  cutEnd?: number;
  /** Secondes de fin de récitation sur un seul plan, choisi avec les recherches `final`, gardé jusqu'au bout. */
  finalHold?: number;
  final?: string[];
}

export interface Clip {
  id: number;
  file: string;
  duration: number;
  theme: string;
  /** Luminosité moyenne (0-255), quand elle a été mesurée. */
  level?: number;
}

type Rendition = PixabayRendition;
type PixabayHit = PixabayVideo;

const MAX_BYTES = 300 * 1024 * 1024;
const FPS = VIDEO.fps;

export function loadMontageConfig(style: MontageStyle): MontageConfig {
  const all = JSON.parse(fs.readFileSync(path.join(PATHS.data, "montage.json"), "utf8")) as Record<MontageStyle, MontageConfig>;
  return all[style];
}

/**
 * Plans du montage : uniquement des versions qui remplissent l'image verticale sans agrandissement
 * (4K pour un plan horizontal recadré, HD pour un plan vertical). L'intro peut descendre en dessous.
 */
function pickRendition(hit: PixabayHit, sharpOnly = true): Rendition | null {
  const rendition = sharpestRendition(hit.videos, VIDEO, MAX_BYTES);
  if (!rendition) return null;
  if (sharpOnly && upscale(rendition, VIDEO) > 1) return null;
  return rendition;
}

/** En dessous (luminosité moyenne sur 255), un plan paraît noir sur un téléphone : ciel étoilé, lune sur fond noir… */
const MIN_BRIGHTNESS = 40;

/** Luminosité moyenne de trois images du plan. */
async function brightness(file: string, duration: number): Promise<number> {
  const values: number[] = [];
  for (const at of [0.2, 0.5, 0.8]) {
    const out = await run("ffmpeg", ["-v", "error", "-ss", (duration * at).toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=160:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"]);
    const match = out.match(/YAVG=([\d.]+)/);
    if (match) values.push(Number(match[1]));
  }
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 255;
}

/**
 * Bandes noires incrustées dans la vidéo source (format cinéma) : le plan ne remplirait pas l'image.
 * Seules des bandes symétriques et presque noires comptent (une scène sombre n'est pas une bande).
 */
export async function hasBlackBars(file: string, duration: number): Promise<boolean> {
  const out = await run("ffmpeg", ["-v", "info", "-ss", (duration * 0.5).toFixed(2), "-i", file, "-frames:v", "4", "-vf", "scale=480:-2,cropdetect=limit=24:round=2:reset=0", "-f", "null", "-"], { stderr: true });
  const crops = [...out.matchAll(/x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+) w:(\d+) h:(\d+)/g)];
  const size = /, (\d+)x(\d+)/.exec(out.slice(out.indexOf("Stream #0:0")));
  if (!crops.length || !size) return false;
  const [x1, x2, y1, y2, w, h] = crops.at(-1)!.slice(1).map(Number);
  const W = 480;
  const H = Math.round((480 * Number(size[2])) / Number(size[1]));
  const letterbox = w >= W * 0.97 && h < H * 0.97 && Math.abs(y1 - (H - 1 - y2)) <= H * 0.03;
  const pillarbox = h >= H * 0.97 && w < W * 0.97 && Math.abs(x1 - (W - 1 - x2)) <= W * 0.03;
  return letterbox || pillarbox;
}

/**
 * Plans Pixabay pour une recherche. Sans clé Gemini, seuls les plans déjà vérifiés sont retenus ; s'il n'y en a pas
 * assez pour cette recherche, des plans vérifiés de la même catégorie (ciel, mer, lave…) complètent.
 */
export async function searchClips(
  query: string,
  count: number,
  theme: string,
  rand: () => number,
  used: Set<number>,
  options: { allowConstruction?: boolean; id?: number } = {},
): Promise<Clip[]> {
  const { allowConstruction = false, id } = options;
  const gemini = geminiConfigured();
  const byId = id ? await pixabayById(id) : null;
  const hits = id ? (byId ? [byId] : []) : await pixabaySearch(query, 30);
  const sharpOnly = theme !== "intro";
  const fits = (h: PixabayHit) => !used.has(h.id) && h.duration >= 6 && !PEOPLE.test(h.tags) && !EXCLUDED.test(h.tags) && (allowConstruction || !ARTIFICIAL.test(h.tags)) && Boolean(pickRendition(h, sharpOnly));
  let candidates = hits.filter(fits);
  if (!gemini) candidates = candidates.filter((h) => isVerified(h.id, allowConstruction));
  // Tirage parmi les 10 plus populaires : de la variété d'une vidéo à l'autre, toujours de bons plans.
  const shuffled = candidates.slice(0, 10).sort(() => rand() - 0.5);
  if (shuffled.length < count) {
    // Complément : plans déjà vérifiés de la même catégorie, demandés un par un à Pixabay.
    const known = new Set([...used, ...shuffled.map((h) => h.id)]);
    for (const extra of plansFor(categoriesFor(query), allowConstruction, Math.floor(rand() * 1e9), known).slice(0, count + 3)) {
      const hit = await pixabayById(extra);
      if (hit && fits(hit)) shuffled.push(hit);
    }
  }
  const clips: Clip[] = [];
  let tries = 0;
  for (const hit of shuffled) {
    if (clips.length >= count || tries >= count + 3) break;
    tries++;
    used.add(hit.id);
    // Déjà refusé par Gemini : on ne le retélécharge pas (un plan 4K pèse 50 à 150 Mo).
    if (dejaRefuse(hit.id) && !isVerified(hit.id, allowConstruction)) continue;
    const rendition = pickRendition(hit, sharpOnly)!;
    let file: string;
    try {
      file = await downloadFile(rendition.url, path.join(PATHS.cache, "pixabay", `${hit.id}-${rendition.height}.mp4`));
    } catch {
      continue;
    }
    if (!(await showsOnlyCreation(file, hit.id, allowConstruction))) {
      // Plan refusé : il ne servira jamais, il ne garde pas sa place dans la réserve.
      fs.rmSync(file, { force: true });
      continue;
    }
    const duration = await probeDuration(file);
    if (theme !== "intro" && (await hasBlackBars(file, duration))) {
      console.log(`    ✗ plan #${hit.id} écarté (bandes noires)`);
      continue;
    }
    // L'intro peut être sombre (elle l'est exprès) ; les plans du montage, non.
    if (theme !== "intro") {
      const level = await brightness(file, duration);
      // La lave et les flammes se filment souvent de nuit : le thème « enfer » peut être plus sombre.
      if (level < (theme === "enfer" ? 22 : MIN_BRIGHTNESS)) {
        console.log(`    ✗ plan #${hit.id} écarté (trop sombre : ${level.toFixed(0)})`);
        continue;
      }
      clips.push({ id: hit.id, file, duration, theme, level });
      continue;
    }
    clips.push({ id: hit.id, file, duration, theme });
  }
  return clips;
}

export async function collectClips(seed: number, config: MontageConfig): Promise<{ intro?: Clip; byTheme: Record<string, Clip[]>; finalClip?: Clip }> {
  const rand = mulberry32(seed);
  const used = new Set<number>(); // un même plan ne sert qu'une fois, même s'il répond à deux recherches
  const introQuery = config.intro[seed % config.intro.length];
  const introId = config.introIds?.length ? config.introIds[seed % config.introIds.length] : undefined;
  const [intro] = await searchClips(introQuery, 1, "intro", rand, used, { allowConstruction: config.introAllowConstruction, id: introId });
  if (!intro) throw new Error(`Aucune vidéo d'intro pour « ${introQuery} ».`);
  const byTheme: Record<string, Clip[]> = {};
  for (const [theme, queries] of Object.entries(config.themes)) {
    byTheme[theme] = [];
    for (const query of queries) byTheme[theme].push(...(await searchClips(query, config.clipsPerQuery, theme, rand, used)));
    console.log(`  ${theme} : ${byTheme[theme].length} plan(s)`);
  }
  if (!Object.values(byTheme).flat().length) throw new Error("Aucun plan trouvé pour le montage (connexion internet ? clé Pixabay ?).");
  let finalClip: Clip | undefined;
  for (const query of config.final ?? []) {
    [finalClip] = await searchClips(query, 1, "final", rand, used, {});
    if (finalClip) break;
  }
  return { intro, byTheme, finalClip };
}

/** Thème visuel de chaque verset : ceux indiqués par le passage (ex. les cieux → espace), sinon un mélange. */
function themeAt(t: number, script: VideoScript, perAyah: Record<string, string[]>, fallback: string[], k: number): string {
  const ayah = script.ayat.find((a) => t >= a.showFrom && t < a.showTo) ?? script.ayat.at(-1)!;
  const themes = perAyah[String(ayah.ayah)] ?? fallback;
  return themes[k % themes.length];
}

async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) await worker(items[next++]);
  }));
}

/**
 * Fond complet de la vidéo : intro lente et désaturée jusqu'à dropAt, puis plans coupés toutes les `cut` secondes.
 * Coupes calées à l'image près (30 i/s) pour que le BAM tombe exactement avec le son.
 */
export async function buildMontage(options: {
  script: VideoScript;
  dropAt: number;
  total: number;
  cut: number;
  seed: number;
  perAyah: Record<string, string[]>;
  dest: string;
  style?: MontageStyle;
}): Promise<void> {
  const { script, dropAt, total, seed, perAyah, dest } = options;
  const config = loadMontageConfig(options.style ?? "creation");
  const cut = options.cut || config.cut;
  const collected = await collectClips(seed, config);
  const { byTheme, intro } = collected;
  const rand = mulberry32(seed + 1);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "hasanat-montage-"));
  const { width, height } = VIDEO;
  const encode = ["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS)];

  try {
    const segments: Array<{ out: string; args: string[] }> = [];

    // Intro « sombre » : plan ralenti, presque noir et blanc. Intro « choc » : vitesse réelle, contrastée.
    const introFrames = Math.round(dropAt * FPS);
    if (intro) {
      const speed = config.introStyle === "sombre" ? 0.6 : 1;
      const introSpan = Math.min(intro.duration - 0.5, (introFrames / FPS) * speed + 0.2);
      const introLook = config.introStyle === "sombre" ? "hue=s=0.15,eq=brightness=-0.08:contrast=1.05" : "eq=brightness=-0.04:contrast=1.15:saturation=1.05";
      segments.push({
        out: path.join(work, "000.mp4"),
        args: [
          "-stream_loop", "-1", "-ss", String(Math.max(0, (intro.duration - introSpan) / 2)), "-i", intro.file,
          "-vf", `setpts=PTS/${speed},scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${FPS},${introLook},setsar=1`,
          "-frames:v", String(introFrames),
        ],
      });
    }
    const introCount = segments.length;

    // Montage : les plans s'enchaînent de plus en plus vite (de `cut` à `cutEnd` secondes, bornes arrondies à l'image),
    // puis un dernier plan reste à l'écran pendant les `finalHold` dernières secondes de récitation et le carton final.
    const totalFrames = Math.round(total * FPS);
    const cutEnd = options.cut ? cut : (config.cutEnd ?? cut);
    const holdFrom = config.finalHold ? Math.max(dropAt + 2, script.recitationDuration - config.finalHold) : total;
    const holdFrame = Math.min(totalFrames, Math.round(holdFrom * FPS));
    const recent: number[] = [];
    let frame = introFrames;
    for (let k = 0; frame < holdFrame; k++) {
      const progress = Math.min(1, (frame / FPS - dropAt) / Math.max(0.001, holdFrom - dropAt));
      const length = cut + (cutEnd - cut) * progress;
      const end = Math.min(frame + Math.max(2, Math.round(length * FPS)), holdFrame);
      const theme = themeAt(frame / FPS, script, perAyah, config.defaultThemes, k);
      const candidates = byTheme[theme]?.length ? byTheme[theme] : Object.values(byTheme).flat();
      const fresh = candidates.filter((c) => !recent.includes(c.id));
      const clip = (fresh.length ? fresh : candidates)[Math.floor(rand() * (fresh.length || candidates.length))];
      recent.push(clip.id);
      if (recent.length > 3) recent.shift();
      const offset = 0.3 + rand() * Math.max(0, clip.duration - length - 0.6);
      const zoom = 1 + rand() * 0.15;
      const x = rand().toFixed(3);
      segments.push({
        out: path.join(work, `${String(k + 1).padStart(3, "0")}.mp4`),
        args: [
          "-ss", offset.toFixed(3), "-i", clip.file,
          "-vf", `scale=${Math.round(width * zoom)}:${Math.round(height * zoom)}:force_original_aspect_ratio=increase,crop=${width}:${height}:(iw-ow)*${x}:(ih-oh)/2,fps=${FPS},eq=contrast=1.08:saturation=1.12:brightness=-0.05,setsar=1`,
          "-frames:v", String(end - frame),
        ],
      });
      frame = end;
    }

    if (holdFrame < totalFrames) {
      // Plan final : le plus beau, sans coupe ni recadrage décalé.
      const all = Object.values(byTheme).flat();
      const last = collected.finalClip ?? all[Math.floor(rand() * all.length)];
      segments.push({
        out: path.join(work, "final.mp4"),
        args: [
          "-stream_loop", "-1", "-ss", "0.5", "-i", last.file,
          "-vf", `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},fps=${FPS},eq=contrast=1.05:saturation=1.1,setsar=1`,
          "-frames:v", String(totalFrames - holdFrame),
        ],
      });
    }

    await pool(segments, 4, (s) => run("ffmpeg", ["-v", "error", "-y", ...s.args, ...encode, s.out]).then(() => {}));
    const list = path.join(work, "list.txt");
    fs.writeFileSync(list, segments.map((s) => `file '${s.out.replace(/'/g, "'\\''")}'`).join("\n"));
    await run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", dest]);
    const rhythm = cutEnd !== cut ? `de ${cut} à ${cutEnd} s` : `de ${cut} s`;
    const hold = holdFrame < totalFrames ? `, puis plan final de ${((totalFrames - holdFrame) / FPS).toFixed(1)} s` : "";
    const introText = `${dropAt.toFixed(1)} s d'intro`;
    console.log(`  Montage : ${segments.length - introCount} plans ${rhythm} après ${introText}${hold}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Son « drop » : avant dropAt, la récitation est lointaine (étouffée, plus basse) ;
 * à dropAt, un coup de tonnerre, et la récitation revient plein volume.
 */
export async function applyDrop(recitation: string, impact: string, dropAt: number, dest: string): Promise<void> {
  const recLufs = await measureLoudness(recitation);
  const impactLufs = await measureLoudness(impact);
  const impactGain = recLufs - 2 - impactLufs; // tonnerre franc, sans écraser le premier mot
  const at = Math.max(0, dropAt - 0.1); // le claquement du fichier commence 0,1 s après son début
  await run("ffmpeg", [
    "-v", "error", "-y", "-i", recitation, "-i", impact,
    "-filter_complex",
    [
      `[0:a]atrim=0:${dropAt.toFixed(3)},asetpts=PTS-STARTPTS,lowpass=f=1100,volume=-11dB[before]`,
      `[0:a]atrim=${dropAt.toFixed(3)},asetpts=PTS-STARTPTS[after]`,
      "[before][after]concat=n=2:v=0:a=1[rec]",
      `[1:a]volume=${impactGain.toFixed(1)}dB,adelay=${Math.round(at * 1000)}:all=1[boom]`,
      "[rec][boom]amix=inputs=2:duration=longest:normalize=0[out]",
    ].join(";"),
    "-map", "[out]", "-ac", "2", "-ar", "44100", "-c:a", "aac", "-b:a", "192k", dest,
  ]);
}
