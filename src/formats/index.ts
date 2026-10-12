// Les formats du kit. Tous partent d'une récitation minutée de quran.com (un vrai récitateur)
// et changent seulement l'habillage.
import type { Lang } from "../config.ts";
import type { MontageStyle } from "../montage.ts";

/** coran : texte arabe synchronisé ; ambiance : plan + phrase ; surligne : page froissée + marqueur. */
export type FormatKind = "coran" | "ambiance" | "surligne";

export interface FormatInfo {
  id: string;
  name: string;
  description: string;
  kind: FormatKind;
  variant?: "classique" | "creation" | "cinema";
  /** Clé Pixabay nécessaire (fond vidéo, montage ou texture). */
  needsPixabay?: boolean;
  montage?: MontageStyle;
  /** « paysage » : vidéo 16:9 (1920×1080) que TikTok permet de regarder téléphone tourné. Portrait par défaut. */
  orientation?: "portrait" | "paysage";
  defaults?: {
    /** Fond par défaut (« pixabay:<recherche> »). */
    bg?: string;
    /** Étalonnage ffmpeg du fond. */
    grade?: string;
    /** true : aucune construction dans le fond (nature pure). */
    strictBg?: boolean;
    /** Taille du fond préparé (bandeau 16:9 du format cinéma). */
    bgSize?: { width: number; height: number };
    text?: Record<Lang, string>;
    hook?: Record<Lang, string>;
  };
}

const DARK = "eq=brightness=-0.1:saturation=0.75:contrast=1.05";

export const FORMATS: FormatInfo[] = [
  {
    id: "coran-traduction",
    name: "Coran à l'écrit + traduction",
    description: "Texte arabe qui s'illumine mot à mot + traduction du verset, sur ciel étoilé (sans clé) ou vidéo de nature.",
    kind: "coran",
    variant: "classique",
    // Avec un plan Pixabay : nature seule (ni personnes ni constructions), comme le format cinéma.
    defaults: { strictBg: true },
  },
  {
    id: "coran-cinema",
    name: "Coran à l'écrit + traduction (16:9)",
    description: "Vidéo horizontale 16:9 (plein écran sur TikTok, téléphone tourné) : plan de nature, texte arabe et traduction synchronisés.",
    kind: "coran",
    variant: "cinema",
    orientation: "paysage",
    needsPixabay: true,
    // Assombri juste ce qu'il faut : le dégradé du format assure la lecture, le plan garde ses couleurs.
    defaults: { bg: "pixabay:sea of clouds sunrise", grade: "eq=brightness=-0.06:saturation=0.92:contrast=1.04", strictBg: true },
  },
  {
    id: "creation",
    name: "La création d'Allah (intro étouffée puis BAM)",
    description: "Premier verset récité à voix basse sur un plan sombre, puis tonnerre, flash et montage rapide de la création (espace, ciel, terre). Passages de 2 versets ou plus.",
    kind: "coran",
    variant: "creation",
    montage: "creation",
    needsPixabay: true,
  },
  {
    id: "citation-coran",
    name: "Citation + Coran",
    description: "Plan sombre et apaisant + courte phrase de rappel (--texte) + récitation.",
    kind: "ambiance",
    needsPixabay: true,
    defaults: {
      bg: "pixabay:swans lake night",
      grade: DARK,
      text: {
        fr: "« sois un bon musulman dans la vraie vie, pas seulement sur les réseaux. »",
        en: "“be a good muslim in real life, not just on social media.”",
      },
    },
  },
  {
    id: "invitation-ecoute",
    name: "Invitation à écouter",
    description: "« Apaise ton cœur et écoute… » + récitation (ex. Al-Kahf le vendredi). Phrase modifiable avec --texte.",
    kind: "ambiance",
    needsPixabay: true,
    defaults: {
      bg: "pixabay:rain window night",
      grade: DARK,
      text: {
        fr: "apaise ton cœur et écoute sourate al-kahf, c'est vendredi aujourd'hui",
        en: "calm your heart and listen to surah al-kahf, it's jumu'ah today",
      },
    },
  },
  {
    id: "nature-coran",
    name: "Nature + Coran",
    description: "Plan de nature en 16:9 (plein écran sur TikTok) + récitation, sans texte.",
    kind: "ambiance",
    orientation: "paysage",
    needsPixabay: true,
    defaults: { bg: "pixabay:waterfall", grade: "eq=saturation=1.05", strictBg: true },
  },
  {
    id: "surligne",
    name: "Surligné",
    description: "La traduction sur une page de papier froissé, une phrase surlignée au marqueur ; la page change à chaque mot.",
    kind: "surligne",
    needsPixabay: true,
  },
];

export function getFormat(id: string): FormatInfo {
  const format = FORMATS.find((f) => f.id === id);
  if (!format) throw new Error(`Format inconnu « ${id} ». Voir \`npm run formats\`.`);
  return format;
}
