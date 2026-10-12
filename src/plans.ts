// Plans Pixabay déjà vérifiés (data/plans-verifies.json) : une IA a regardé chacun d'eux (ni personne, ni texte ;
// ni construction pour la « nature »). Sans clé Gemini, ce sont les SEULS plans que le kit accepte.
import fs from "node:fs";
import path from "node:path";
import { PATHS } from "./config.ts";

export interface PlanVerifie {
  id: number;
  /** Catégories : ce que montre le plan (ciel, mer, montagne…). */
  c: string[];
}

interface PlansFile {
  nature: PlanVerifie[];
  ambiance: PlanVerifie[];
}

/** Catégories de plans, avec les mots (anglais et français) qui y renvoient dans une recherche. */
export const CATEGORIES: Record<string, { label: string; words: RegExp }> = {
  ciel: { label: "ciel et nuages", words: /\b(clouds?|sky|skies|heaven|nuages?|ciel|cieux)\b/i },
  aube: { label: "lever ou coucher du soleil", words: /\b(sunset|sunrise|dawn|dusk|golden|aube|lever|coucher|soleil|crepuscule|crépuscule)\b/i },
  mer: { label: "mer, vagues, plage", words: /\b(seas?|oceans?|beach|waves?|coast|mer|oc[ée]an|plage|vagues?|c[ôo]te)\b/i },
  eau: { label: "rivière, cascade, lac", words: /\b(rivers?|streams?|waterfalls?|lakes?|creek|rivi[èe]res?|cascades?|lacs?|ruisseaux?)\b/i },
  montagne: { label: "montagnes, canyons", words: /\b(mountains?|canyons?|hills?|cliffs?|valley|montagnes?|collines?|falaises?|vall[ée]e)\b/i },
  foret: { label: "forêt, arbres", words: /\b(forests?|trees?|woods?|leaves|jungle|for[êe]ts?|arbres?|bois|feuilles?)\b/i },
  fleurs: { label: "fleurs, prairies", words: /\b(flowers?|meadows?|bloom|blossom|spring|fleurs?|prairies?|printemps)\b/i },
  pluie: { label: "pluie", words: /\b(rain|rainy|raindrops?|window|pluie|vitres?|fen[êe]tre)\b/i },
  brume: { label: "brume, brouillard", words: /\b(fog|foggy|mist|misty|brume|brouillard)\b/i },
  orage: { label: "orage, éclairs", words: /\b(storms?|lightning|thunder|thunderstorm|orages?|[ée]clairs?|tonnerre)\b/i },
  nuit: { label: "nuit, étoiles, espace", words: /\b(night|stars?|starry|moon|milky|galaxy|space|aurora|nuit|[ée]toiles?|lune|espace|galaxie|aurore)\b/i },
  desert: { label: "désert, dunes", words: /\b(deserts?|dunes?|d[ée]sert)\b/i },
  neige: { label: "neige, glaciers", words: /\b(snow|snowy|winter|glaciers?|ice|neige|hiver|glace)\b/i },
  lave: { label: "volcan, lave, feu", words: /\b(volcano|lava|magma|eruption|fire|flames?|volcan|lave|feu|flammes?|enfer)\b/i },
};

// La création, pas les créatures humaines : on écarte les plans où figurent des personnes (d'après leurs mots-clés).
export const PEOPLE = /\b(woman|women|man|men|people|person|girl|boy|child|children|kid|model|couple|portrait|face|lady|guy|family|crowd|selfie|fashion|bikini|dance|dancer|tourist|hiker|surfer|wedding|party|swimmer|yoga)\b/i;
// Symboles religieux, statues, ville, fête foraine, machines, images générées : écartés par prudence (d'après les
// mots-clés), même quand aucune personne n'est visible. Vaut pour tous les fonds, construction permise ou non.
export const EXCLUDED = /\b(buddha|buddhism|buddhist|temple|church|cross|christmas|halloween|statue|idol|pagoda|shrine|torii|shinto|religion|religious|jesus|cristo|angel|easter|hindu|monk|cemetery|grave|tomb|skull|witch|zodiac|city|urban|street|shops?|skyscrapers?|roller coaster|amusement|factory|industry|chimney|radar|abandoned|harvester|ai generated|car|pet|dog|candles?|candlelight|lanterns?|alcohol|wine|beer|bar|club|casino)\b/i;
// Ni trucages (encre dans un bocal imitant une galaxie), ni constructions humaines : uniquement la création.
export const ARTIFICIAL = /\b(jar|experiment|ink|paint|liquid|fractal|stonehenge|monument|ruins|building|city|skyline|skyscraper|castle|temple|church|tower|bridge|car|road|boat|ship|lighthouse|town|village|harbor|harbour|street|urban|dubai|statue|cross)\b/i;

let cached: PlansFile | null = null;

export function loadPlans(): PlansFile {
  cached ??= JSON.parse(fs.readFileSync(path.join(PATHS.data, "plans-verifies.json"), "utf8")) as PlansFile;
  return cached;
}

/** Plans admis : la nature seule, ou aussi ceux où une construction se voit (fonds d'ambiance). */
export function verifiedPlans(allowConstruction: boolean): PlanVerifie[] {
  const { nature, ambiance } = loadPlans();
  return allowConstruction ? [...nature, ...ambiance] : nature;
}

export function isVerified(id: number, allowConstruction: boolean): boolean {
  return verifiedPlans(allowConstruction).some((p) => p.id === id);
}

/** Catégories évoquées par une recherche (« rain window night » → pluie, nuit). */
export function categoriesFor(query: string): string[] {
  return Object.entries(CATEGORIES)
    .filter(([, c]) => c.words.test(query))
    .map(([id]) => id);
}

/**
 * Plans vérifiés d'une ou plusieurs catégories, dans un ordre qui dépend de la graine (de la variété d'une vidéo à
 * l'autre, mais la même vidéo si on la refait). Sans catégorie connue : tous les plans.
 */
export function plansFor(categories: string[], allowConstruction: boolean, seed: number, exclude: Set<number> = new Set()): number[] {
  const all = verifiedPlans(allowConstruction).filter((p) => !exclude.has(p.id));
  const wanted = categories.length ? all.filter((p) => categories.some((c) => p.c.includes(c))) : all;
  const pool = wanted.length ? wanted : all;
  // Mélange déterministe (Fisher-Yates avec un petit générateur pseudo-aléatoire).
  let a = (seed >>> 0) || 1;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const ids = pool.map((p) => p.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
