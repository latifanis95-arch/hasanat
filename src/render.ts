// Assemble le dossier HyperFrames d'une vidéo (HTML + polices + audio + fond) puis lance le rendu MP4.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Background, prepareVideoBackground } from "./backgrounds.ts";
import { HYPERFRAMES_VERSION, PATHS, type Quality, ROOT, type Size, VIDEO } from "./config.ts";
import { run, tool } from "./lib/proc.ts";

export function buildDir(id: string): string {
  return path.join(PATHS.build, id);
}

export async function writeProject(dir: string, html: string, background: Background, duration: number, frame: Size = VIDEO): Promise<void> {
  const assets = path.join(dir, "assets");
  fs.mkdirSync(path.join(assets, "fonts"), { recursive: true });

  fs.writeFileSync(path.join(dir, "index.html"), html);
  fs.writeFileSync(
    path.join(dir, "hyperframes.json"),
    JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", paths: { assets: "assets" }, media: { autoProxy: true } }, null, 2),
  );
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ id: path.basename(dir), name: path.basename(dir) }, null, 2));

  for (const font of fs.readdirSync(PATHS.fonts).filter((f) => f.endsWith(".ttf"))) {
    fs.copyFileSync(path.join(PATHS.fonts, font), path.join(assets, "fonts", font));
  }
  if (!fs.existsSync(PATHS.gsap)) throw new Error("GSAP introuvable : lance `npm install`.");
  fs.copyFileSync(PATHS.gsap, path.join(assets, "gsap.min.js"));

  if (background.kind === "video") {
    await prepareVideoBackground(background.source, path.join(assets, "background.mp4"), duration, background.grade, background.size ?? frame);
  }
}

/** Le moteur de rendu HyperFrames installé par `npm install` (version épinglée dans package.json). */
const HYPERFRAMES_BIN = path.join(ROOT, "node_modules", "hyperframes", "bin", "hyperframes.mjs");

/**
 * Rendu HyperFrames (une page web animée, filmée image par image dans un navigateur sans fenêtre).
 * Au premier rendu, HyperFrames télécharge ce navigateur (Chrome Headless Shell) : quelques minutes, une seule fois.
 * En priorité basse sur Mac et Linux : l'ordinateur reste utilisable pendant le rendu.
 */
export async function renderProject(dir: string, outFile: string, quality: Quality): Promise<void> {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  if (!fs.existsSync(HYPERFRAMES_BIN)) throw new Error(`HyperFrames ${HYPERFRAMES_VERSION} introuvable : lance \`npm install\` dans le dossier du kit.`);
  // Priorité basse, mais jamais plus basse que 10 : HyperFrames remet lui-même ses processus à 10, et macOS refuse
  // de remonter une priorité. Windows n'a pas de commande « nice » : on lance directement.
  const already = process.platform === "win32" ? 10 : os.getPriority();
  const nice = already < 10 ? ["nice", "-n", String(10 - already)] : [];
  const [cmd, ...args] = [
    ...nice,
    process.execPath, HYPERFRAMES_BIN, "render", dir, "--output", outFile, "--quality", quality,
    // Images des vidéos de fond extraites en PNG (sans perte) : les dégradés de ciel et le feuillage restent nets.
    "--video-frame-format", "png", "--strict",
    // Images extraites des vidéos de fond effacées à la fin du rendu (sinon un cache caché grossit à chaque vidéo).
    "--frames-cache-dir", "off",
    // Lancé par un assistant (pas de terminal) : pas de barre de progression ligne par ligne.
    ...(process.stdout.isTTY ? [] : ["--quiet"]),
  ];
  await run(cmd, args, {
    inherit: true,
    env: {
      // Ni statistiques d'usage, ni recherche de mise à jour, ni questionnaire : le rendu reste local et silencieux.
      HYPERFRAMES_NO_TELEMETRY: "1",
      HYPERFRAMES_NO_UPDATE_CHECK: "1",
      HYPERFRAMES_NO_FEEDBACK: "1",
      // FFmpeg choisi dans .env (FFMPEG_PATH) : HyperFrames utilise le même.
      ...(process.env.FFMPEG_PATH?.trim() ? { HYPERFRAMES_FFMPEG_PATH: tool("ffmpeg") } : {}),
      ...(process.env.FFPROBE_PATH?.trim() ? { HYPERFRAMES_FFPROBE_PATH: tool("ffprobe") } : {}),
    },
  });
}
