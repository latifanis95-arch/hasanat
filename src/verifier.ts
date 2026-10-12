// `npm run verifier` : contrôle de l'installation, sans jamais afficher une clé.
import fs from "node:fs";
import path from "node:path";
import { loadAmbiances } from "./ambiances.ts";
import { LOCAL, PATHS, ROOT } from "./config.ts";
import { GEMINI_MODEL } from "./lib/gemini.ts";
import { run, tool } from "./lib/proc.ts";
import { listTextures } from "./textures.ts";

type Etat = "ok" | "attention" | "erreur";
const icon: Record<Etat, string> = { ok: "✓", attention: "…", erreur: "✗" };

function line(etat: Etat, label: string, detail = ""): void {
  console.log(`${icon[etat]} ${label.padEnd(26)} ${detail}`);
}

async function version(cmd: string): Promise<string | null> {
  try {
    return (await run(cmd, ["-version"])).split("\n")[0].replace(/ Copyright.*/, "").trim();
  } catch {
    return null;
  }
}

async function testUrl(url: string, init?: RequestInit): Promise<number> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    return res.status;
  } catch {
    return 0;
  }
}

export async function verifier(): Promise<void> {
  let erreurs = 0;
  const fail = (label: string, detail: string) => {
    erreurs++;
    line("erreur", label, detail);
  };

  // Node.js
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major > 22 || (major === 22 && minor >= 18)) line("ok", "Node.js", `v${process.versions.node}`);
  else fail("Node.js", `v${process.versions.node} : il faut la version 22.18 ou plus récente (prends la version LTS sur nodejs.org).`);

  // FFmpeg
  const ffmpeg = await version("ffmpeg");
  const ffprobe = await version("ffprobe");
  if (ffmpeg) line("ok", "FFmpeg", ffmpeg);
  else fail("FFmpeg", "introuvable (voir README, « Installation »). Après l'installation, ferme et rouvre le terminal.");
  if (ffprobe) line("ok", "FFprobe", "présent");
  else fail("FFprobe", "introuvable (il est installé avec FFmpeg).");
  if (ffmpeg) {
    const encoders = await run("ffmpeg", ["-hide_banner", "-encoders"]).catch(() => "");
    if (/libx264/.test(encoders)) line("ok", "Encodeur H.264", "libx264");
    else fail("Encodeur H.264", `libx264 absent de ${tool("ffmpeg")} : installe une version complète de FFmpeg.`);
  }

  // Dépendances npm
  const gsap = fs.existsSync(PATHS.gsap);
  const hyperframes = fs.existsSync(path.join(ROOT, "node_modules", "hyperframes", "bin", "hyperframes.mjs"));
  if (gsap && hyperframes) line("ok", "Dépendances (npm)", "GSAP + HyperFrames installés");
  else fail("Dépendances (npm)", "lance `npm install` dans le dossier du kit.");

  // Clés (jamais affichées)
  const envFile = path.join(ROOT, ".env");
  if (!fs.existsSync(envFile)) line("attention", "Fichier .env", "absent : copie .env.example en .env (les clés sont facultatives pour le ciel étoilé).");
  const pixabay = process.env.PIXABAY_API_KEY?.trim();
  if (!pixabay) line("attention", "Clé Pixabay", "absente : seul le fond « ciel étoilé » est possible (clé gratuite : https://pixabay.com/api/docs/).");
  else {
    const status = await testUrl(`https://pixabay.com/api/videos/?${new URLSearchParams({ key: pixabay, q: "clouds", per_page: "3" })}`);
    if (status === 200) line("ok", "Clé Pixabay", "présente et valide");
    else if (status === 0) line("attention", "Clé Pixabay", "présente, mais Pixabay ne répond pas (connexion internet ?).");
    else fail("Clé Pixabay", `refusée par Pixabay (HTTP ${status}) : recopie-la depuis https://pixabay.com/api/docs/ (connecté à ton compte).`);
  }
  const gemini = process.env.GEMINI_API_KEY?.trim();
  if (!gemini) line("attention", "Clé Gemini (facultative)", "absente : seuls les plans déjà vérifiés sont utilisés (c'est sûr).");
  else {
    const status = await testUrl(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`, { headers: { "x-goog-api-key": gemini } });
    if (status === 200) line("ok", "Clé Gemini (facultative)", `présente et valide (${GEMINI_MODEL})`);
    else if (status === 0) line("attention", "Clé Gemini (facultative)", "présente, mais Google ne répond pas (connexion internet ?).");
    else if (status === 404) line("attention", "Clé Gemini (facultative)", `modèle ${GEMINI_MODEL} introuvable : indique un modèle récent dans .env (GEMINI_MODEL).`);
    else line("attention", "Clé Gemini (facultative)", `refusée (HTTP ${status}) : recrée-la sur https://aistudio.google.com/apikey. En attendant, le kit marche sans.`);
  }

  // quran.com
  const quran = await testUrl("https://api.quran.com/api/v4/chapters/1?language=fr");
  if (quran === 200) line("ok", "quran.com", "joignable (texte, traductions, récitations)");
  else fail("quran.com", "injoignable : vérifie la connexion internet.");

  // Ambiances et textures
  const ambiances = loadAmbiances();
  const ready = ambiances.filter((a) => fs.existsSync(path.join(PATHS.ambiances, `${a.id}.m4a`))).length;
  const impact = fs.existsSync(path.join(PATHS.ambiances, "impact-tonnerre.m4a"));
  if (ready === ambiances.length && impact) line("ok", "Ambiances", `${ready} prêtes (pluie, vagues, oiseaux…)`);
  else line("attention", "Ambiances", `${ready}/${ambiances.length} prêtes : lance \`npm run ambiances\`.`);
  const textures = listTextures().length;
  if (textures) line("ok", "Textures (surligne)", `${textures} prêtes`);
  else line("attention", "Textures (surligne)", pixabay ? "lance `npm run ambiances`." : "nécessitent la clé Pixabay, puis `npm run ambiances`.");

  // Place disque
  try {
    fs.mkdirSync(LOCAL, { recursive: true });
    const st = fs.statfsSync(LOCAL);
    const free = (st.bavail * st.bsize) / 1024 ** 3;
    if (free >= 8) line("ok", "Place libre", `${free.toFixed(0)} Go`);
    else line("attention", "Place libre", `${free.toFixed(1)} Go : prévois au moins 8 Go (vidéos 4K en cache ; npm run menage pour faire de la place).`);
  } catch {
    // sans importance
  }

  console.log("");
  if (erreurs) {
    console.log(`✗ ${erreurs} point(s) à corriger avant de faire une vidéo.`);
    process.exitCode = 1;
  } else {
    console.log("✓ Tout est prêt. Première vidéo : npm run video -- --passage raad-28");
  }
}
