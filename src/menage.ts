// Ménage du disque : les plans 4K de Pixabay pèsent 50 à 300 Mo chacun. Après chaque vidéo, la réserve est ramenée
// sous une taille maximale (les plans servis il y a le plus longtemps partent d'abord), et les fichiers
// intermédiaires du rendu sont effacés. `npm run menage` vide tout ce qui peut être retéléchargé.
import fs from "node:fs";
import path from "node:path";
import { PATHS } from "./config.ts";

/** Taille maximale de la réserve de plans vidéo (Go), modifiable dans .env (HASANAT_CACHE_MAX_GO). */
export function maxCacheBytes(): number {
  const go = Number(process.env.HASANAT_CACHE_MAX_GO);
  return (Number.isFinite(go) && go > 0 ? go : 4) * 1024 ** 3;
}

function filesIn(dir: string): Array<{ file: string; size: number; used: number }> {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) return filesIn(file);
    const st = fs.statSync(file);
    return [{ file, size: st.size, used: Math.max(st.mtimeMs, st.atimeMs) }];
  });
}

export function dirSize(dir: string): number {
  return filesIn(dir).reduce((n, f) => n + f.size, 0);
}

export const go = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} Go`;

/** Ramène la réserve de plans Pixabay sous `max` octets. Renvoie les octets libérés. */
export function trimPixabay(max = maxCacheBytes()): number {
  const files = filesIn(path.join(PATHS.cache, "pixabay")).sort((a, b) => a.used - b.used);
  let total = files.reduce((n, f) => n + f.size, 0);
  let freed = 0;
  for (const f of files) {
    if (total <= max) break;
    fs.rmSync(f.file, { force: true });
    total -= f.size;
    freed += f.size;
  }
  return freed;
}

/** Efface les dossiers de rendu intermédiaires. */
export function cleanBuilds(): number {
  const size = dirSize(PATHS.build);
  fs.rmSync(PATHS.build, { recursive: true, force: true });
  return size;
}
