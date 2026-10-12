// Chaînes de fabrication, une par famille de format : composition → fichiers du projet → son → rendu.
import fs from "node:fs";
import path from "node:path";
import { ambianceForVideo } from "./ambiance-visuelle.ts";
import { ambianceForScene, impactFile, mixAmbiance } from "./ambiances.ts";
import { type Background, resolveBackground, stretchFilter } from "./backgrounds.ts";
import { buildCaption } from "./caption.ts";
import { type Lang, PATHS, type Quality, type Settings, type Size, VIDEO } from "./config.ts";
import { buildAmbiance } from "./formats/ambiance.ts";
import { buildCoranTraduction } from "./formats/coran-traduction.ts";
import type { FormatInfo } from "./formats/index.ts";
import { run } from "./lib/proc.ts";
import { applyDrop, buildMontage } from "./montage.ts";
import { renderProject, writeProject } from "./render.ts";
import type { VideoScript } from "./script.ts";

export interface ProduceContext {
  settings: Settings;
  format: FormatInfo;
  script: VideoScript;
  dir: string;
  id: string;
  lang: Lang;
  seed: number;
  quality: Quality;
  noRender: boolean;
  handle: string;
  outro: boolean;
  bg?: string;
  text?: string;
  hook?: string;
  ambiance?: string;
  ambianceDb: number;
  drop?: string;
  cut?: number;
  montageThemes?: Record<string, string[]>;
  captionHook?: string;
  /** Taille de l'image finale (portrait 1080×1920 ou paysage 1920×1080). */
  frame: Size;
  /** Format surligné : phrase exacte de la traduction à surligner. */
  highlight?: string;
  /** Mots-clés du plan de fond (pour l'ambiance quand Gemini n'est pas là). */
  bgHint?: string;
}

/**
 * Piste finale : la voix (éventuellement traitée), mêlée ou non à une ambiance.
 * Ambiance « auto » : choisie en regardant `visual` (le plan de fond, après le BAM s'il y en a un) ; sans image
 * (ciel étoilé, papier), la pluie douce, qui va avec les fonds sombres.
 */
export async function finalAudio(ctx: ProduceContext, voice: string, total: number, ambianceFrom = 0, visual?: string): Promise<void> {
  const dest = path.join(ctx.dir, "assets", "audio.m4a");
  if (ctx.ambiance === "auto") {
    const seen = visual ? await ambianceForVideo(visual, { from: ambianceFrom }) : null;
    const fallback = visual ? ambianceForScene(`${ctx.bgHint ?? ""} ${ctx.bg ?? ctx.format.defaults?.bg ?? ""}`) : "pluie-douce";
    ctx.ambiance = seen?.ambiance ?? fallback;
    console.log(`  Ambiance : ${ctx.ambiance}${seen ? ` (${seen.raison})` : visual ? " (d'après les mots-clés du plan)" : " (fond sans image)"}`);
  }
  if (ctx.ambiance) await mixAmbiance(voice, ctx.ambiance, total, ctx.ambianceDb, dest, ambianceFrom);
  else fs.copyFileSync(voice, dest);
}

export async function finish(ctx: ProduceContext, caption: string): Promise<string | null> {
  fs.mkdirSync(PATHS.output, { recursive: true });
  const captionFile = path.join(PATHS.output, `${ctx.id}.txt`);
  fs.writeFileSync(captionFile, `${caption}\n`);
  if (ctx.noRender) {
    console.log(`  Projet prêt : ${ctx.dir}`);
    return null;
  }
  const out = path.join(PATHS.output, `${ctx.id}.mp4`);
  await renderProject(ctx.dir, out, ctx.quality);
  report(out, captionFile);
  return out;
}

function report(out: string, captionFile: string): void {
  console.log(`✓ Vidéo : ${out}`);
  console.log(`✓ Légende : ${captionFile}`);
}

/** Vidéo sans texte : plan + son assemblés directement par ffmpeg (aucune capture d'écran, une seule compression). */
async function finishPlain(ctx: ProduceContext, caption: string, source: string, grade: string | undefined, duration: number): Promise<string | null> {
  fs.mkdirSync(PATHS.output, { recursive: true });
  const captionFile = path.join(PATHS.output, `${ctx.id}.txt`);
  fs.writeFileSync(captionFile, `${caption}\n`);
  if (ctx.noRender) return null;
  const out = path.join(PATHS.output, `${ctx.id}.mp4`);
  const { width, height } = ctx.frame;
  const fade = 0.6;
  const fadeAt = (duration - fade).toFixed(3);
  const stretch = await stretchFilter(source, duration);
  await run("ffmpeg", [
    "-v", "error", "-y",
    "-stream_loop", "-1", "-i", source,
    "-i", path.join(ctx.dir, "assets", "audio.m4a"),
    "-t", duration.toFixed(3),
    "-vf", `${stretch}scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},setsar=1,fps=${VIDEO.fps},${grade ?? "null"},fade=t=out:st=${fadeAt}:d=${fade}`,
    "-af", `afade=t=out:st=${fadeAt}:d=${fade}`,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
    out,
  ]);
  report(out, captionFile);
  return out;
}

/** Début de la phrase du BAM (« 84 », « 190:3 ») ou, par défaut, du 2e verset entendu. */
function dropTime(script: VideoScript, spec: string | undefined): number {
  let at: number | undefined;
  if (spec) {
    const [ayah, phrase = 1] = spec.split(":").map(Number);
    const target = script.ayat.find((a) => a.ayah === ayah);
    if (!target) throw new Error(`--drop : le verset ${ayah} n'est pas dans la récitation.`);
    at = target.phrases[phrase - 1]?.showFrom;
    if (at === undefined) throw new Error(`--drop : le verset ${ayah} n'a que ${target.phrases.length} phrase(s).`);
  } else {
    at = script.ayat[1]?.phrases[0].showFrom ?? script.ayat[0].phrases[1]?.showFrom;
  }
  if (at === undefined || at < 1) throw new Error("Passage trop court pour une intro avant le BAM : choisis un passage d'au moins 2 versets.");
  return at;
}

/** Versets qui évoquent l'Enfer (d'après leur traduction) : le montage y montre lave et flammes. */
const HELL = /\b(enfer|fournaise|g[ée]henne|brasier|flammes?|sa[qk]ar|feu|hell|blaze|fire)\b/i;
function hellThemes(script: VideoScript): Record<string, string[]> {
  return Object.fromEntries(script.ayat.filter((a) => HELL.test(a.translation)).map((a) => [String(a.ayah), ["enfer"]]));
}

/** Coran à l'écrit (classique, cinéma) et création : texte arabe synchronisé. */
export async function produceCoran(ctx: ProduceContext): Promise<string | null> {
  const { format, script } = ctx;
  const variant = format.variant ?? "classique";
  const withDrop = variant === "creation";
  const dropAt = withDrop ? dropTime(script, ctx.drop) : undefined;
  const defaults = format.defaults ?? {};
  const background: Background = withDrop
    ? { kind: "montage" }
    : await resolveBackground(ctx.bg ?? defaults.bg, ctx.seed, { allowConstruction: !defaults.strictBg, grade: defaults.grade, size: defaults.bgSize, frame: ctx.frame });
  if (background.kind === "video") ctx.bgHint = background.hint;
  const composition = buildCoranTraduction(script, {
    background,
    handle: ctx.handle,
    outro: ctx.outro,
    fullLengthAudio: Boolean(ctx.ambiance) || withDrop,
    variant,
    dropAt,
    hookText: ctx.hook ?? defaults.hook?.[ctx.lang],
    size: ctx.frame,
  });
  await writeProject(ctx.dir, composition.html, background, composition.duration, ctx.frame);
  const assets = path.join(ctx.dir, "assets");
  let voice = script.audioFile;
  if (withDrop && dropAt !== undefined) {
    await buildMontage({
      script,
      dropAt,
      total: composition.duration,
      cut: ctx.cut ?? 0,
      seed: ctx.seed,
      perAyah: { ...hellThemes(script), ...(ctx.montageThemes ?? {}) },
      dest: path.join(assets, "background.mp4"),
      style: format.montage,
    });
    voice = path.join(assets, "drop.m4a");
    await applyDrop(script.audioFile, impactFile(), dropAt, voice);
  }
  // Avec un BAM, l'ambiance n'arrive qu'au BAM : avant, elle couvrirait la récitation étouffée de l'intro.
  const backgroundFile = path.join(ctx.dir, "assets", "background.mp4");
  await finalAudio(ctx, voice, composition.duration, withDrop && dropAt !== undefined ? dropAt : 0, fs.existsSync(backgroundFile) ? backgroundFile : undefined);
  // L'accroche affichée dans la vidéo (--accroche) ouvre aussi la légende.
  const shownHook = ctx.hook ?? defaults.hook?.[ctx.lang];
  return finish(ctx, buildCaption(script, ctx.captionHook ?? (shownHook ? `${shownHook} 🤍` : undefined)));
}

/** Citation, invitation, nature : un plan, la récitation, au plus une courte phrase. */
export async function produceAmbiance(ctx: ProduceContext): Promise<string | null> {
  const { format, script } = ctx;
  const defaults = format.defaults ?? {};
  const duration = script.recitationDuration;
  const background = await resolveBackground(ctx.bg ?? defaults.bg, ctx.seed, { allowConstruction: !defaults.strictBg, grade: defaults.grade, frame: ctx.frame });
  if (background.kind === "video") ctx.bgHint = background.hint;
  const text = ctx.text ?? defaults.text?.[ctx.lang] ?? "";
  // Avec une phrase à l'écran, la référence du passage (venue de quran.com) s'affiche discrètement dessous.
  const range = script.from === script.to ? `${script.from}` : `${script.from}-${script.to}`;
  const reference = text ? `${script.chapter.nameSimple} · ${range}` : "";
  const caption = buildCaption(script, ctx.captionHook ?? (text ? text.replace(/[«»“”]/g, "").trim() : undefined));
  if (!text && background.kind === "video") {
    // Rien à écrire à l'écran (nature) : rendu direct, la netteté du plan source est gardée intacte.
    fs.mkdirSync(path.join(ctx.dir, "assets"), { recursive: true });
    await finalAudio(ctx, script.audioFile, duration, 0, background.source);
    return finishPlain(ctx, caption, background.source, background.grade, duration);
  }
  const composition = buildAmbiance({ duration, text, reference, size: ctx.frame });
  await writeProject(ctx.dir, composition.html, background, duration, ctx.frame);
  await finalAudio(ctx, script.audioFile, duration, 0, background.kind === "video" ? path.join(ctx.dir, "assets", "background.mp4") : undefined);
  return finish(ctx, caption);
}
