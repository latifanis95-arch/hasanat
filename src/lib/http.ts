import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { PATHS } from "../config.ts";

const USER_AGENT = "hasanat-kit/1.0 (+https://github.com/latifanis95-arch/hasanat)";

function cacheFile(url: string): string {
  const hash = crypto.createHash("sha1").update(url).digest("hex").slice(0, 20);
  return path.join(PATHS.cache, "http", `${hash}.json`);
}

/** Adresse affichable : la clé API (Pixabay la passe dans l'adresse) n'apparaît jamais dans un message. */
export function redact(url: string): string {
  return url.replace(/([?&](?:key|api_key|apikey|token)=)[^&]+/gi, "$1***");
}

async function fetchWithRetry(url: string, tries = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status} pour ${redact(url)}`);
      // Une erreur 4xx (hors 429) ne se corrigera pas en réessayant.
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
  }
  throw lastError;
}

/**
 * GET JSON mis en cache sur disque : le texte du Coran ne change pas, on ne le télécharge qu'une fois.
 * `maxAgeMs` : au-delà, la réponse est redemandée (recherches Pixabay, dont les résultats évoluent).
 */
export async function fetchJson<T>(url: string, options: { maxAgeMs?: number } = {}): Promise<T> {
  const file = cacheFile(url);
  if (fs.existsSync(file) && (!options.maxAgeMs || Date.now() - fs.statSync(file).mtimeMs < options.maxAgeMs)) {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  }
  const res = await fetchWithRetry(url);
  const data = (await res.json()) as T;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
  return data;
}

/** Télécharge un fichier une seule fois (réutilisé ensuite depuis le cache). */
export async function downloadFile(url: string, dest: string): Promise<string> {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    // Date d'utilisation : `npm run menage` efface d'abord les fichiers servis il y a longtemps.
    try {
      const now = new Date();
      fs.utimesSync(dest, now, now);
    } catch {
      // sans importance
    }
    return dest;
  }
  const res = await fetchWithRetry(url);
  if (!res.body) throw new Error(`Réponse vide pour ${redact(url)}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const partial = `${dest}.${process.pid}.part`; // propre à ce processus : deux rendus peuvent télécharger le même fichier
  await pipeline(Readable.fromWeb(res.body as WebReadableStream), fs.createWriteStream(partial));
  fs.renameSync(partial, dest);
  return dest;
}
