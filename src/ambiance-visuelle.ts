// Fond sonore choisi en regardant l'image : pluie si la scène est pluvieuse,
// très sombre ou brumeuse ; la mer si c'est la mer ; un ruisseau devant une rivière ou une cascade ; les oiseaux
// au lever du jour ; les oiseaux aussi pour la verdure, les montagnes et le reste.
// Gemini (facultatif) décrit la scène (six images du plan ou du montage), la luminosité est mesurée ici ; résultat
// mémorisé par plan. Sans Gemini : une image sombre appelle la pluie, sinon les mots-clés du plan décident.
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PATHS } from "./config.ts";
import { generateContent, geminiConfigured } from "./lib/gemini.ts";
import { probeDuration, run } from "./lib/proc.ts";

const CACHE = path.join(PATHS.cache, "ambiance-visuelle.json");
/** Luminosité moyenne (0-255) sous laquelle la scène est « très sombre » (mesurée sur la bibliothèque : nuit, crépuscule, sous-bois). */
export const DARK_LUMA = 48;

const SCENE = ["pluie", "vitre", "brume", "nuit", "mer", "eau_courante", "verdure", "montagnes", "aube"] as const;
type Scene = Record<(typeof SCENE)[number], boolean>;

const PROMPT = `Ces images viennent du fond d'une vidéo (un plan de nature, ou un montage rapide de plusieurs plans). Réponds UNE SEULE FOIS pour l'ensemble des images : vrai seulement si l'élément est bien visible sur au moins la moitié d'entre elles, d'après ce qu'on VOIT :
- pluie : de la pluie ou des gouttes d'eau qui tombent
- vitre : une vitre ou une fenêtre mouillée au premier plan
- brume : brouillard, brume, ou ciel gris très couvert qui domine l'image
- nuit : scène de nuit
- mer : mer, océan, vagues, plage, côte, ou vue sous l'eau
- eau_courante : rivière, ruisseau, torrent ou cascade (eau qui coule ; un lac ou un étang calme ne compte pas)
- verdure : forêt, arbres, herbe, prairie, plantes
- montagnes : montagnes, collines, falaises, canyon
- aube : lever ou coucher du soleil, ciel doré ou orangé`;

function readCache(): Record<string, { scene: Scene; luma: number }> {
  try {
    return fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  } catch {
    return {};
  }
}

/** Clé du plan : son chemin, sa taille, sa date et la fenêtre regardée (un même fichier peut être rendu de nouveau). */
function keyOf(file: string, from: number, to: number): string {
  const st = fs.statSync(file);
  // « v2 » : 6 images et un élément compté s'il domine (avant : 3 images, un seul plan de rivière suffisait).
  return createHash("sha1").update(`v2|${path.resolve(file)}|${st.size}|${st.mtimeMs}|${from.toFixed(1)}|${to.toFixed(1)}`).digest("hex");
}

/** La règle : la pluie l'emporte dès que c'est sombre, pluvieux ou brumeux ; puis la mer, l'eau qui coule, l'aube, les oiseaux. */
export function ambianceFromScene(scene: Partial<Scene>, luma: number): { ambiance: string; raison: string } {
  if (scene.pluie || scene.brume || scene.nuit || luma < DARK_LUMA) {
    const raison = scene.pluie ? "pluie à l'image" : scene.brume ? "brume" : scene.nuit ? "nuit" : `image sombre (${Math.round(luma)})`;
    return { ambiance: scene.vitre ? "pluie-vitre" : "pluie-douce", raison };
  }
  if (scene.mer) return { ambiance: "vagues", raison: "mer" };
  if (scene.eau_courante) return { ambiance: "ruisseau", raison: "rivière ou cascade" };
  if (scene.aube) return { ambiance: "oiseaux-aube", raison: "lever ou coucher du soleil" };
  return { ambiance: "oiseaux", raison: scene.verdure ? "verdure" : scene.montagnes ? "montagnes" : "plein jour" };
}

/** Luminosité moyenne (0-255) d'une vidéo, après l'étalonnage `grade` s'il y en a un (2 images par seconde). */
export async function meanLuma(file: string, grade?: string, window: { from?: number; to?: number } = {}): Promise<number> {
  const range = [...(window.from ? ["-ss", window.from.toFixed(2)] : []), ...(window.to ? ["-to", window.to.toFixed(2)] : [])];
  const stats = await run("ffmpeg", [
    "-v", "info", ...range, "-i", file,
    "-vf", `${grade ? `${grade},` : ""}fps=2,scale=320:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG`, "-f", "null", "-",
  ], { stderr: true }).catch(() => "");
  const values = [...String(stats).matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 128;
}

/**
 * Ambiance accordée à une vidéo (le plan de fond, ou le montage après le BAM avec `from`).
 * null si Gemini est indisponible : l'appelant garde alors son choix d'après les mots-clés.
 */
export async function ambianceForVideo(file: string, window: { from?: number; to?: number } = {}): Promise<{ ambiance: string; raison: string } | null> {
  if (!fs.existsSync(file)) return null;
  const duration = await probeDuration(file);
  const from = Math.max(0, window.from ?? 0);
  const to = Math.min(duration, window.to ?? duration);
  const key = keyOf(file, from, to);
  const known = readCache()[key];
  if (known) return ambianceFromScene(known.scene, known.luma);

  // Luminosité : moyenne sur toute la fenêtre. Sans Gemini, une image sombre appelle la pluie ; sinon, mots-clés.
  const luma = await meanLuma(file, undefined, { from, to });
  const byLuma = luma < DARK_LUMA ? ambianceFromScene({}, luma) : null;
  if (!geminiConfigured()) return byLuma;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hasanat-ambiance-"));
  try {
    const images: string[] = [];
    for (const [k, at] of [0.1, 0.26, 0.42, 0.58, 0.74, 0.9].entries()) {
      const jpg = path.join(tmp, `${k}.jpg`);
      await run("ffmpeg", ["-v", "error", "-y", "-ss", (from + (to - from) * at).toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=512:-2", "-q:v", "5", jpg]);
      images.push(fs.readFileSync(jpg).toString("base64"));
    }
    const body = await generateContent<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }>({
      contents: [{ role: "user", parts: [{ text: PROMPT }, ...images.map((data) => ({ inlineData: { mimeType: "image/jpeg", data } }))] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: Object.fromEntries(SCENE.map((k) => [k, { type: "BOOLEAN" }])), required: [...SCENE] },
        temperature: 0,
      },
    });
    const parsed = JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? "null") as Scene | Scene[] | null;
    const list = (Array.isArray(parsed) ? parsed : [parsed]).filter((s): s is Scene => Boolean(s) && typeof s === "object");
    if (!list.length) return byLuma;
    // Plusieurs réponses (une par image) : un élément vu sur la majorité des images compte.
    const scene = Object.fromEntries(SCENE.map((k) => [k, list.filter((s) => s[k]).length * 2 > list.length || (list.length === 1 && list[0][k])])) as Scene;
    const merged = { ...readCache(), [key]: { scene, luma } };
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    const partial = `${CACHE}.${process.pid}.part`;
    fs.writeFileSync(partial, `${JSON.stringify(merged, null, 2)}\n`);
    fs.renameSync(partial, CACHE);
    return ambianceFromScene(scene, luma);
  } catch (err) {
    console.log(`  (ambiance d'après l'image indisponible : ${err instanceof Error ? err.message : err})`);
    return byLuma;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
