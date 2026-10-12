import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..");

// Clés privées (.env, jamais versionné).
const ENV_FILE = path.join(ROOT, ".env");
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

/**
 * Le gros cache (vidéos 4K, audio des sourates) et les rendus intermédiaires vivent hors du projet, dans le dossier
 * de cache du système : ils ne sont ni synchronisés (iCloud, OneDrive), ni envoyés par erreur sur GitHub.
 */
function localDir(): string {
  if (process.env.HASANAT_CACHE_DIR) return path.resolve(process.env.HASANAT_CACHE_DIR);
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Caches", "hasanat-kit");
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "hasanat-kit");
  return path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "hasanat-kit");
}
export const LOCAL = localDir();

export const PATHS = {
  cache: path.join(LOCAL, "cache"),
  build: path.join(LOCAL, "build"),
  output: path.join(ROOT, "output"),
  fonts: path.join(ROOT, "assets", "fonts"),
  backgrounds: path.join(ROOT, "assets", "backgrounds"),
  /** Textures de papier du format « surligne » (téléchargées par `npm run ambiances`, jamais versionnées). */
  textures: path.join(ROOT, "assets", "textures"),
  data: path.join(ROOT, "data"),
  settings: path.join(ROOT, "config", "settings.json"),
  gsap: path.join(ROOT, "node_modules", "gsap", "dist", "gsap.min.js"),
  ambiances: path.join(ROOT, "assets", "ambiances"),
};

// Version épinglée pour que deux rendus du même script donnent la même vidéo.
export const HYPERFRAMES_VERSION = "0.8.96";

export const VIDEO = { width: 1080, height: 1920, fps: 30 } as const;

/** Taille de l'image finale. En paysage 16:9, TikTok propose « plein écran » : on tourne le téléphone. */
export interface Size {
  width: number;
  height: number;
}
export const LANDSCAPE: Size = { width: 1920, height: 1080 };

export type Lang = "fr" | "en";
export type Quality = "draft" | "looks" | "delivery";

export interface Settings {
  /** Nom du compte affiché en filigrane (ex. "@moncompte"). Vide = pas de filigrane. */
  handle: string;
  /** Récitateur par défaut (voir `npm run reciters`). */
  reciter: string;
  lang: Lang;
  /** Traduction quran.com utilisée pour chaque langue (31 = Hamidullah, 20 = Saheeh International). */
  translations: Record<Lang, number>;
  /** Carton de fin qui invite à partager. */
  outro: boolean;
  quality: Quality;
  /** Ambiance par défaut sous la récitation ("auto", "aucune" ou un id de data/ambiances.json). */
  ambiance: string;
  /** Volume de l'ambiance en dB (0 = niveau de référence, environ 12 dB sous la récitation). */
  ambianceVolume: number;
}

const DEFAULTS: Settings = {
  handle: "",
  reciter: "yasser",
  lang: "fr",
  translations: { fr: 31, en: 20 },
  outro: true,
  quality: "looks",
  ambiance: "auto",
  ambianceVolume: 2,
};

export function loadSettings(): Settings {
  if (!fs.existsSync(PATHS.settings)) return DEFAULTS;
  const raw = JSON.parse(fs.readFileSync(PATHS.settings, "utf8")) as Partial<Settings>;
  return {
    ...DEFAULTS,
    ...raw,
    translations: { ...DEFAULTS.translations, ...(raw.translations ?? {}) },
  };
}
