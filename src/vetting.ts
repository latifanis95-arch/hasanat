// Contrôle visuel des plans Pixabay. Les mots-clés ne suffisent pas (un « coucher de soleil » peut montrer les tours
// de Dubaï, un « lac » une personne qui se baigne) : un plan n'est accepté que s'il a été REGARDÉ.
// 1. Plans de data/plans-verifies.json : déjà regardés, acceptés directement.
// 2. Avec une clé Gemini : Gemini regarde trois images du plan (verdict mémorisé : un plan n'est vérifié qu'une fois).
// 3. Sans clé Gemini, ou si Gemini ne répond pas : le plan est REFUSÉ. Jamais de plan non vérifié dans une vidéo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PATHS } from "./config.ts";
import { generateContent, geminiConfigured } from "./lib/gemini.ts";
import { probeDuration, run } from "./lib/proc.ts";
import { isVerified } from "./plans.ts";

/** Plans de la création (nature, ciel, espace). */
const CREATION = {
  cache: path.join(PATHS.cache, "verifications-plans.json"),
  keys: ["humain", "construction", "texte", "symbole"],
  prompt: `Tu vérifies des plans pour une vidéo de Coran montrant la création (nature, ciel, espace).
Pour ces trois images extraites d'une même vidéo, réponds uniquement en JSON :
{"humain": bool, "construction": bool, "texte": bool, "symbole": bool}
- humain : une personne, une silhouette humaine, une partie du corps, ou une représentation d'un être humain (statue, dessin, peinture, sculpture) est visible.
- construction : un bâtiment, une ville, des lumières de ville, une route, un pont, une clôture, une barrière, un phare, un véhicule, un bateau, un avion ou un monument est visible.
- texte : du texte, un logo ou un filigrane est incrusté dans l'image.
- symbole : un symbole ou un lieu religieux (croix, statue, idole, temple, église, autel, bougies de culte), une décoration de fête (Noël, Halloween), de l'alcool ou quoi que ce soit d'indécent est visible.`,
};

type Verdict = Record<string, boolean>;
type Check = { cache: string; keys: string[]; prompt: string };

function readCache(file: string): Record<string, Verdict> {
  try {
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, Verdict>) : {};
  } catch {
    return {};
  }
}

let warned = false;

/** Quota Gemini dépassé (429) : on patiente et on réessaie plutôt que de laisser passer le plan sans contrôle. */
async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const busy = /429|RESOURCE_EXHAUSTED|Resource exhausted|503|UNAVAILABLE/i.test(err instanceof Error ? err.message : String(err));
      if (!busy || attempt >= 5) throw err;
      await new Promise((resolve) => setTimeout(resolve, 4000 * 2 ** attempt));
    }
  }
}

/** Verdict de Gemini sur un plan (mémorisé sous `key`), ou null si Gemini est absent ou indisponible. */
async function verdict(file: string, key: string, check: Check): Promise<Verdict | null> {
  if (!geminiConfigured()) return null;
  const known = readCache(check.cache)[key];
  if (known) return known;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hasanat-plan-"));
  try {
    const duration = await probeDuration(file);
    const images: string[] = [];
    for (const [k, at] of [0.15, 0.5, 0.85].entries()) {
      const jpg = path.join(tmp, `${k}.jpg`);
      await run("ffmpeg", ["-v", "error", "-y", "-ss", (duration * at).toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=512:-2", "-q:v", "5", jpg]);
      images.push(fs.readFileSync(jpg).toString("base64"));
    }
    const body = await withRetry(() => generateContent<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }>({
      contents: [{ role: "user", parts: [{ text: check.prompt }, ...images.map((data) => ({ inlineData: { mimeType: "image/jpeg", data } }))] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: Object.fromEntries(check.keys.map((k) => [k, { type: "BOOLEAN" }])),
          required: check.keys,
        },
        temperature: 0,
      },
    }));
    // Un verdict par image peut revenir sous forme de liste : un seul signalement suffit à écarter le plan.
    const parsed = JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text ?? "null") as Verdict | Verdict[] | null;
    const verdicts = (Array.isArray(parsed) ? parsed : [parsed]).filter((v): v is Verdict => Boolean(v) && typeof v === "object");
    if (!verdicts.length || verdicts.some((v) => check.keys.some((k) => typeof v[k] !== "boolean"))) throw new Error("réponse illisible");
    const result = Object.fromEntries(check.keys.map((k) => [k, verdicts.some((v) => v[k])]));
    const merged = { ...readCache(check.cache), [key]: result };
    fs.mkdirSync(path.dirname(check.cache), { recursive: true });
    const partial = `${check.cache}.${process.pid}.part`;
    fs.writeFileSync(partial, `${JSON.stringify(merged, null, 2)}\n`);
    fs.renameSync(partial, check.cache);
    return result;
  } catch (err) {
    if (!warned) console.log(`  (vérification Gemini indisponible : ${err instanceof Error ? err.message : err} ; seuls les plans déjà vérifiés sont utilisés)`);
    warned = true;
    return null;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Plan déjà refusé lors d'une vérification précédente : inutile de le télécharger à nouveau. */
export function dejaRefuse(id: number): boolean {
  const v = readCache(CREATION.cache)[String(id)];
  return Boolean(v && Object.values(v).some(Boolean));
}

/**
 * true si le plan ne montre que la création (ni personnes, ni constructions, ni texte).
 * allowConstruction : pour un fond d'ambiance (fenêtre sous la pluie), seules personnes et texte sont refusés.
 */
export async function showsOnlyCreation(file: string, id: number, allowConstruction = false): Promise<boolean> {
  if (isVerified(id, allowConstruction)) return true;
  const v = await verdict(file, String(id), CREATION);
  if (!v) return false;
  const refused = Object.keys(v).filter((k) => v[k] && !(k === "construction" && allowConstruction));
  if (refused.length) console.log(`    ✗ plan #${id} écarté (${refused.join(", ")})`);
  return !refused.length;
}
