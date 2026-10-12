// Format « Surligné » (exemple : modèle CapCut « It's you vs you ») : une page de papier froissé couverte de texte,
// une phrase surlignée au marqueur jaune qui reste au centre, et la page qui change à chaque mot récité
// (autre mise en page, autre police pour la phrase). Le texte de la page est la traduction officielle du passage
// et la phrase surlignée en est un morceau exact : rien n'est réécrit. L'effet « œil de poisson » est ajouté au rendu.
import type { Size } from "../config.ts";
import type { VideoScript } from "../script.ts";
import { esc, nbsp } from "./blocs.ts";
import type { Composition } from "./coran-traduction.ts";

export interface SurligneOptions {
  /** Phrase à surligner : morceau exact de la traduction (sinon une phrase est choisie automatiquement). */
  phrase?: string;
  /** Titre de la page (ex. « Sourate Ar-Ra'd »). */
  title: string;
  /** Référence et récitateur, en pied de page. */
  footer: string;
  seed: number;
  size?: Size;
}

const TAIL = 1.6;
/** Écart minimal entre deux changements de page (secondes). */
const MIN_CUT = 0.42;

/** Générateur pseudo-aléatoire déterministe (même graine → même vidéo). */
function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Texte de traduction nettoyé (sans notes ni crochets doublés), tel qu'affiché. */
export function cleanTranslation(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Phrase surlignée : celle demandée si elle figure mot pour mot dans la traduction, sinon le dernier morceau
 * de phrase (entre ponctuations) de 4 à 14 mots — souvent la conclusion du verset.
 */
export function pickPhrase(full: string, wanted?: string): string {
  if (wanted && full.includes(wanted)) return wanted;
  const pieces = full.split(/(?<=[.;:!?])\s+|,\s+/).map((p) => p.trim().replace(/[.;:,]$/, ""));
  const fitting = pieces.filter((p) => {
    const n = p.split(/\s+/).length;
    return n >= 4 && n <= 14;
  });
  const chosen = fitting.at(-1) ?? full.split(/\s+/).slice(0, 12).join(" ");
  return full.includes(chosen) ? chosen : full.split(/\s+/).slice(0, 12).join(" ");
}

/** Quatre mises en page : police du titre, du texte, et de la phrase surlignée. */
const VARIANTS = [
  { title: "font: italic 700 86px/1.05 'Cormorant Garamond'", body: "font: 600 62px/1.32 'Cormorant Garamond'", mark: "font: 700 80px/1.15 'Caveat'", width: 1180 },
  { title: "font: 800 66px/1.1 'Inter'", body: "font: 500 50px/1.45 'Inter'", mark: "font: 900 60px/1.2 'Inter'; text-transform: uppercase; letter-spacing: -0.01em", width: 1080 },
  { title: "font: 700 78px/1.08 'Cormorant Garamond'", body: "font: 500 68px/1.28 'Cormorant Garamond'", mark: "font: italic 700 76px/1.15 'Cormorant Garamond'", width: 1260 },
  { title: "font: 700 92px/1 'Caveat'", body: "font: 400 48px/1.5 'Inter'", mark: "font: 300 62px/1.25 'Inter'; letter-spacing: 0.12em", width: 1000 },
];

export function buildSurligne(script: VideoScript, options: SurligneOptions): Composition {
  const width = options.size?.width ?? 1080;
  const height = options.size?.height ?? 1920;
  const fix = (n: number) => n.toFixed(3);
  const random = rng(options.seed);
  // Un verset repris par le récitateur (plusieurs passages entendus) n'est écrit qu'une fois sur la page.
  const full = cleanTranslation([...new Map(script.ayat.map((a) => [a.key, a.translation])).values()].join(" "));
  const picked = pickPhrase(full, options.phrase);
  const at = full.indexOf(picked);
  // La ponctuation qui suit la phrase dans le texte (« facilité ! », « ." ») reste avec elle : jamais en tête de la
  // colonne de droite. Un guillemet suivi d'une lettre ouvre la suite et n'est pas pris. Le texte n'est que découpé.
  const tail = /^\s*[.,;:!?…»”’")\]]+(?=\s|$)/.exec(full.slice(at + picked.length))?.[0] ?? "";
  const phrase = picked + tail;
  const before = nbsp(full.slice(0, at));
  const after = nbsp(full.slice(at + phrase.length));
  const recitationEnd = script.recitationDuration;
  const duration = recitationEnd + TAIL;

  // Changements de page : sur les débuts de mots récités, jamais plus d'un toutes les MIN_CUT secondes.
  const starts = script.ayat.flatMap((a) => a.phrases.flatMap((p) => p.words.map((w) => w.start))).sort((x, y) => x - y);
  const cuts: number[] = [0];
  for (const s of starts) if (s - cuts.at(-1)! >= MIN_CUT && s < recitationEnd - 0.2) cuts.push(s);
  // Fin calme : la dernière page reste à l'écran pendant la queue.
  const shots = cuts.map((t, k) => ({
    t,
    v: k === 0 ? 0 : k % VARIANTS.length,
    dx: k === 0 ? 0 : Math.round((random() - 0.5) * 120),
    dy: k === 0 ? 0 : Math.round((random() - 0.5) * 70),
    rot: k === 0 ? 0 : Number(((random() - 0.5) * 4).toFixed(2)),
    scale: Number((1 + random() * 0.1).toFixed(3)),
  }));
  shots.push({ t: recitationEnd, v: 0, dx: 0, dy: 0, rot: 0, scale: 1.04 });

  const band = { top: Math.round(height * 0.17), height: Math.round(height * 0.66) };
  // La phrase surlignée est au centre par construction : la page fait trois hauteurs de bandeau, en trois rangées
  // (texte d'avant en bas de la 1re, la ligne de la phrase au milieu, la suite en haut de la 3e) ; sur sa ligne,
  // trois colonnes (fin du texte d'avant, phrase, début de la suite) qui débordent hors du papier comme dans le modèle.
  // Mots coupés aux espaces ordinaires seulement (les espaces insécables de nbsp() tiennent), et un signe isolé
  // du texte officiel (« lève-toi , ») reste collé au mot d'avant : aucune ligne ni colonne ne commence par lui.
  const words = (t: string) =>
    t.trim().split(/[ \t\n]+/).filter(Boolean).reduce<string[]>((out, w) => {
      if (out.length && /^[.,;:!?…»”’)\]]+$/.test(w)) out[out.length - 1] += ` ${w}`;
      else out.push(w);
      return out;
    }, []);
  const beforeWords = words(before);
  const afterWords = words(after);
  const fullWords = words(nbsp(full));
  const leftWords = beforeWords.length ? beforeWords.slice(-6) : fullWords.slice(-6);
  const rightWords = afterWords.length ? afterWords.slice(0, 6) : fullWords.slice(0, 6);
  const above = beforeWords.slice(0, Math.max(0, beforeWords.length - 6)).join(" ");
  const below = afterWords.slice(6).join(" ");
  const pagesHtml = VARIANTS.map(
    (v, i) => `<div id="p${i}" class="page" style="width:${v.width}px;left:${Math.round((width - v.width) / 2)}px;top:${-band.height}px;height:${band.height * 3}px">
          <div class="haut" style="${v.body}"><h1 style="${v.title}">${esc(options.title)}</h1>${above ? `<p>${esc(above)}</p>` : ""}</div>
          <div class="ligne"><div class="gauche" style="${v.body}"><span>${esc(leftWords.join(" "))}</span></div><div class="cle"><mark style="${v.mark}">${esc(nbsp(phrase))}</mark></div><div class="droite" style="${v.body}"><span>${esc(rightWords.join(" "))}</span></div></div>
          <div class="bas" style="${v.body}">${below ? `<p>${esc(below)}</p>` : ""}<p>${esc(nbsp(full))}</p><footer>${esc(options.footer)}</footer></div>
        </div>`,
  ).join("\n        ");

  const html = `<!doctype html>
<html lang="${script.lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>Surligné</title>
    <script src="assets/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Inter"; src: url("assets/fonts/Inter.ttf") format("truetype"); font-weight: 100 900; font-display: block; }
      @font-face { font-family: "Cormorant Garamond"; src: url("assets/fonts/CormorantGaramond.ttf") format("truetype"); font-weight: 300 700; font-display: block; }
      @font-face { font-family: "Caveat"; src: url("assets/fonts/Caveat.ttf") format("truetype"); font-weight: 400 700; font-display: block; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; }
      #band { position: absolute; left: 0; right: 0; top: ${band.top}px; height: ${band.height}px; overflow: hidden; background: #ece9e2; }
      #paper { position: absolute; inset: -6%; background: url("assets/papier.jpg") center / cover; filter: contrast(1.08) brightness(1.02); }
      .page { position: absolute; display: grid; grid-template-rows: minmax(0, 1fr) auto minmax(0, 1fr); color: #1d1b19; mix-blend-mode: multiply; transform-origin: 50% 50%; opacity: 0; }
      .haut { align-self: end; padding-bottom: 0.25em; }
      .haut h1 { margin-bottom: 0.3em; }
      .bas { align-self: start; padding-top: 0.25em; }
      .bas p + p { margin-top: 0.6em; }
      .bas footer { margin-top: 0.8em; font: 600 30px/1.3 "Inter"; letter-spacing: 0.06em; text-transform: uppercase; color: #6d6862; }
      .ligne { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; column-gap: 0.35em; }
      .gauche, .droite { display: flex; overflow: hidden; white-space: nowrap; }
      .gauche { justify-content: flex-end; }
      .cle { max-width: 860px; text-align: center; }
      mark { color: #141210; padding: 0.02em 0.14em; -webkit-box-decoration-break: clone; box-decoration-break: clone;
        background: linear-gradient(104deg, rgba(246,224,74,0) 0.6%, rgba(246,224,74,0.92) 2.4%, rgba(245,221,64,0.88) 96%, rgba(246,224,74,0) 99%) no-repeat 0 0 / 100% 100%; }
      #ombre { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse 75% 60% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="${width}" data-height="${height}" data-duration="${fix(duration)}" data-fps="30">
      <div id="band" class="clip" data-start="0" data-duration="${fix(duration)}" data-track-index="1">
        <div id="paper"></div>
        ${pagesHtml}
        <div id="ombre"></div>
      </div>
      <audio id="recitation" src="assets/audio.m4a" data-start="0" data-duration="${fix(duration)}" data-track-index="10" data-volume="1"></audio>
    </div>
    <script>
      const SHOTS = ${JSON.stringify(shots)};
      const pages = [0, 1, 2, 3].map((i) => document.getElementById("p" + i));
      const tl = gsap.timeline({ paused: true });
      gsap.set(pages, { opacity: 0 });
      SHOTS.forEach((s, k) => {
        // Une seule page visible à la fois, légèrement décalée, tournée et agrandie autour de la phrase (au centre).
        pages.forEach((p, i) => tl.set(p, i === s.v ? { opacity: 1, x: s.dx, y: s.dy, rotation: s.rot, scale: s.scale } : { opacity: 0 }, s.t));
        tl.set("#paper", { x: (k % 3 - 1) * 26, y: ((k * 7) % 3 - 1) * 18, rotation: k % 2 ? 0.6 : -0.6 }, s.t);
      });
      // Coup de marqueur au tout début.
      tl.fromTo("#p0 mark", { backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%", duration: 0.45, ease: "power2.out" }, 0.1);
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
  return { html, duration };
}

/**
 * Effet « œil de poisson » du modèle CapCut, appliqué à la vidéo rendue :
 * léger bombé au centre, coins assombris et une pointe d'aberration chromatique.
 */
export const SURLIGNE_LENS = "lenscorrection=cx=0.5:cy=0.5:k1=0.18:k2=0.03:i=bilinear,rgbashift=rh=-3:bh=3,vignette=angle=PI/4.5";
