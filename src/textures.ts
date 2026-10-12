// Textures de papier froissé du format « surligne » : deux photos Pixabay, téléchargées chez toi
// (la licence Pixabay interdit de redistribuer les fichiers bruts : ils ne sont jamais dans le dépôt).
import fs from "node:fs";
import path from "node:path";
import { PATHS } from "./config.ts";
import { downloadFile, fetchJson } from "./lib/http.ts";

interface Texture {
  id: number;
  source: string;
}

export function listTextures(): string[] {
  if (!fs.existsSync(PATHS.textures)) return [];
  return fs.readdirSync(PATHS.textures).filter((f) => f.endsWith(".jpg")).sort().map((f) => path.join(PATHS.textures, f));
}

/** Télécharge les textures (clé Pixabay nécessaire). Renvoie false si l'étape a été sautée. */
export async function prepareTextures(): Promise<boolean> {
  const key = process.env.PIXABAY_API_KEY?.trim();
  if (!key) {
    console.log("… textures du format « surligne » : clé Pixabay absente, étape sautée (relance `npm run ambiances` après avoir ajouté la clé).");
    return false;
  }
  const textures = JSON.parse(fs.readFileSync(path.join(PATHS.data, "textures.json"), "utf8")) as Texture[];
  fs.mkdirSync(PATHS.textures, { recursive: true });
  for (const t of textures) {
    const dest = path.join(PATHS.textures, `papier-${t.id}.jpg`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`✓ papier-${t.id}     texture du format surligne (déjà prête)`);
      continue;
    }
    const params = new URLSearchParams({ key, id: String(t.id) });
    const { hits } = await fetchJson<{ hits: Array<{ largeImageURL: string }> }>(`https://pixabay.com/api/?${params}`);
    if (!hits[0]) {
      console.log(`… texture ${t.id} introuvable sur Pixabay (${t.source}) : ignorée.`);
      continue;
    }
    const file = await downloadFile(hits[0].largeImageURL, path.join(PATHS.cache, "textures", `papier-${t.id}.jpg`));
    fs.copyFileSync(file, dest);
    console.log(`✓ papier-${t.id}     texture du format surligne`);
  }
  return listTextures().length > 0;
}
