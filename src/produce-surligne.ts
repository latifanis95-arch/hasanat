// Format « Surligné » (papier froissé + marqueur) : la traduction officielle sur une page, une phrase surlignée
// qui en est un morceau exact. Les textures de papier sont téléchargées chez toi par `npm run ambiances`.
import fs from "node:fs";
import path from "node:path";
import { buildCaption } from "./caption.ts";
import { buildSurligne, SURLIGNE_LENS } from "./formats/surligne.ts";
import { run } from "./lib/proc.ts";
import { finalAudio, finish, type ProduceContext } from "./produce.ts";
import { writeProject } from "./render.ts";
import type { VideoScript } from "./script.ts";
import { listTextures } from "./textures.ts";

const range = (s: VideoScript) => (s.from === s.to ? `${s.from}` : `${s.from}-${s.to}`);
const reference = (s: VideoScript) => `${s.chapter.nameSimple} · ${range(s)}`;

export async function produceSurligne(ctx: ProduceContext): Promise<string | null> {
  const { script } = ctx;
  const textures = listTextures();
  if (!textures.length) throw new Error("Textures de papier absentes : ajoute la clé Pixabay dans .env puis lance `npm run ambiances`.");
  const title = script.lang === "fr" ? `Sourate ${script.chapter.nameSimple}` : `Surah ${script.chapter.nameSimple}`;
  const composition = buildSurligne(script, {
    phrase: ctx.highlight,
    title,
    footer: [reference(script), script.reciter.name].filter(Boolean).join(" — "),
    seed: ctx.seed,
    size: ctx.frame,
  });
  await writeProject(ctx.dir, composition.html, { kind: "montage" }, composition.duration, ctx.frame);
  fs.copyFileSync(textures[ctx.seed % textures.length], path.join(ctx.dir, "assets", "papier.jpg"));
  await finalAudio(ctx, script.audioFile, composition.duration);
  const out = await finish(ctx, buildCaption(script, ctx.captionHook));
  if (out) {
    // Effet « œil de poisson » du modèle : appliqué sur l'image finale, le son est recopié tel quel.
    const lensed = out.replace(/\.mp4$/, ".lens.mp4");
    await run("ffmpeg", ["-v", "error", "-y", "-i", out, "-vf", SURLIGNE_LENS, "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", lensed]);
    fs.renameSync(lensed, out);
  }
  return out;
}
