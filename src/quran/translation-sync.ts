// Traduction qui suit la récitation : la traduction officielle d'un verset (quran.com) est découpée,
// sans changer un seul mot, en autant de morceaux que de phrases arabes affichées.

const MIN_PIECE = 14; // un morceau plus court (« Dis : ») rejoint le suivant

/** Morceaux de la traduction, coupés après une ponctuation suivie d'une espace ou après un tiret entre deux espaces (jamais entre crochets ou parenthèses). */
export function translationPieces(text: string): string[] {
  const pieces: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && /[-–—]/.test(c) && /\s/.test(text[i - 1] ?? "") && /\s/.test(text[i + 1] ?? "")) {
      // Tiret entouré d'espaces (« best in deed - and He is… ») : la traduction anglaise s'en sert pour séparer les propositions.
      pieces.push(text.slice(start, i + 1).trim());
      start = i + 1;
    } else if (depth === 0 && /[,;:.!?…]/.test(c)) {
      let end = i + 1;
      while (end < text.length && /["»”’)\]]/.test(text[end])) end++;
      if (end < text.length && /\s/.test(text[end])) {
        pieces.push(text.slice(start, end).trim());
        start = end;
        i = end - 1;
      }
    }
  }
  const rest = text.slice(start).trim();
  if (rest) pieces.push(rest);

  const merged: string[] = [];
  for (const piece of pieces) {
    const prev = merged.at(-1);
    if (prev !== undefined && prev.length < MIN_PIECE) merged[merged.length - 1] = `${prev} ${piece}`;
    else merged.push(piece);
  }
  const last = merged.at(-1);
  if (merged.length > 1 && last !== undefined && last.length < MIN_PIECE) {
    merged.pop();
    merged[merged.length - 1] = `${merged.at(-1)} ${last}`;
  }
  return merged;
}

/** Frontières cumulées (entre 0 et 1) d'une suite de longueurs. */
function cumulative(lengths: number[]): number[] {
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  let sum = 0;
  return lengths.map((l) => (sum += l) / total);
}

/**
 * Choisit, parmi les frontières de la suite longue, celles qui tombent au plus près des frontières de la suite courte
 * (programmation dynamique). Renvoie, pour chaque frontière courte, l'indice de la frontière longue retenue.
 */
function matchBoundaries(short: number[], long: number[]): number[] {
  const k = short.length - 1; // frontières intérieures
  const l = long.length - 1;
  if (k <= 0) return [];
  const cost: number[][] = Array.from({ length: k }, () => new Array<number>(l).fill(Number.POSITIVE_INFINITY));
  const from: number[][] = Array.from({ length: k }, () => new Array<number>(l).fill(-1));
  for (let j = 0; j < l; j++) cost[0][j] = (long[j] - short[0]) ** 2;
  for (let i = 1; i < k; i++) {
    for (let j = i; j < l; j++) {
      for (let p = i - 1; p < j; p++) {
        const c = cost[i - 1][p] + (long[j] - short[i]) ** 2;
        if (c < cost[i][j]) {
          cost[i][j] = c;
          from[i][j] = p;
        }
      }
    }
  }
  let best = k - 1;
  for (let j = k - 1; j < l; j++) if (cost[k - 1][j] < cost[k - 1][best]) best = j;
  const picked = new Array<number>(k);
  for (let i = k - 1, j = best; i >= 0; j = from[i][j], i--) picked[i] = j;
  return picked;
}

/**
 * Coût d'une phrase arabe laissée sans morceau à elle (elle reprend celui de sa voisine) : il faut que les frontières
 * se rapprochent nettement pour renoncer au 1 pour 1. Réglé sur les passages du catalogue (Az-Zumar 53, Al-Mulk 2,
 * Ghafir 60… se recalent ; Al Imran 185 et At-Tawbah 51, justes en 1 pour 1, ne bougent pas).
 */
const SHARED_PHRASE = 0.013;

/**
 * Alignement monotone quand il y a au moins autant de morceaux que de phrases : chaque frontière arabe intérieure
 * se cale sur une frontière de morceau, ou sur un bord (0 ou 1), sans jamais revenir en arrière. Deux frontières
 * peuvent tomber au même endroit : la phrase entre elles, trop courte pour son propre morceau (« قل يا عبادي »),
 * le partage avec sa voisine au lieu de décaler toute la suite d'une phrase. Renvoie la fin (exclue) des morceaux
 * de chaque phrase.
 */
function alignPhrases(arabic: number[], french: number[]): number[] {
  const n = arabic.length;
  const m = french.length;
  const at = (c: number) => (c === 0 ? 0 : french[c - 1]); // frontière candidate c : après les c premiers morceaux
  // cost[i][c] : meilleur coût quand la phrase i se termine après le morceau c (frontières 0 à i placées).
  const cost: number[][] = Array.from({ length: n }, () => new Array<number>(m + 1).fill(Number.POSITIVE_INFINITY));
  const from: number[][] = Array.from({ length: n }, () => new Array<number>(m + 1).fill(-1));
  for (let i = 0; i < n; i++) {
    // La dernière phrase se termine toujours après le dernier morceau.
    const ends = i === n - 1 ? [m] : Array.from({ length: m + 1 }, (_, c) => c);
    for (const c of ends) {
      const place = i === n - 1 ? 0 : (at(c) - arabic[i]) ** 2;
      for (let p = 0; p <= c; p++) {
        const before = i === 0 ? (p === 0 ? 0 : Number.POSITIVE_INFINITY) : cost[i - 1][p];
        const total = before + place + (p === c ? SHARED_PHRASE : 0);
        if (total < cost[i][c]) {
          cost[i][c] = total;
          from[i][c] = p;
        }
      }
    }
  }
  const ends = new Array<number>(n);
  for (let i = n - 1, c = m; i >= 0; c = from[i][c], i--) ends[i] = c;
  return ends;
}

/**
 * Un morceau de traduction par phrase arabe (poids = nombre de lettres de chaque phrase).
 * Des phrases voisines peuvent partager le même morceau : toujours s'il y a moins de morceaux que de phrases,
 * et sinon quand une phrase est trop courte pour le sien.
 */
export function splitTranslation(text: string, weights: number[]): string[] {
  const n = weights.length;
  const clean = text.trim();
  if (n <= 1 || !clean) return weights.map(() => clean);
  const pieces = translationPieces(clean);
  const arabic = cumulative(weights);
  const french = cumulative(pieces.map((p) => p.length));
  if (pieces.length >= n) {
    const ends = alignPhrases(arabic, french);
    const out = ends.map((end, k) => pieces.slice(k === 0 ? 0 : ends[k - 1], end).join(" "));
    // Une phrase sans morceau reprend le texte de la voisine qu'elle accompagne : celle d'avant si elle est
    // récitée surtout avant la frontière, sinon celle d'après (les deux forment alors un seul bloc à l'écran).
    for (let k = 0; k < n; k++) {
      if (out[k]) continue;
      const start = k === 0 ? 0 : arabic[k - 1];
      const boundary = ends[k] === 0 ? 0 : french[ends[k] - 1];
      const prev = out.slice(0, k).findLast(Boolean);
      const next = out.slice(k + 1).find(Boolean);
      out[k] = (prev !== undefined && ((start + arabic[k]) / 2 < boundary || next === undefined) ? prev : next) ?? clean;
    }
    return out;
  }
  const cuts = [...matchBoundaries(french, arabic).map((j) => j + 1), n];
  const out: string[] = [];
  cuts.forEach((end, k) => {
    while (out.length < end) out.push(pieces[k]);
  });
  return out;
}
