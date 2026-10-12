// Format « Coran à l'écrit + traduction » (exemple : « Coran à l'écrit + traduction.MOV »).
// Plein écran 9:16 (ou 16:9) : le texte arabe s'illumine mot à mot pendant la récitation,
// la traduction suit phrase par phrase dessous, puis un carton final invite à partager.
import { type Background, generateSky } from "../backgrounds.ts";
import type { Lang, Size } from "../config.ts";
import { letterCount, type TimedAyah, type VideoScript } from "../script.ts";

export interface FormatOptions {
  background: Background;
  handle: string;
  outro: boolean;
  /** L'audio couvre toute la vidéo (ambiance jusqu'au carton final), sinon il s'arrête avec la récitation. */
  fullLengthAudio: boolean;
  /** « creation » : fond monté, sans en-tête, flash et texte qui frappe au moment du BAM.
   *  « cinema » : vidéo dans un bandeau 16:9 au centre, texte arabe dessus, traduction dessous. */
  variant?: "classique" | "creation" | "cinema";
  /** Instant du BAM en secondes (variante création). */
  dropAt?: number;
  /** Phrase d'accroche avant le BAM ; le texte coranique n'apparaît alors qu'au BAM. */
  hookText?: string;
  /** Petite ligne au-dessus de l'accroche (ex. « Le monde te dit »). */
  hookLabel?: string;
  /** L'accroche est barrée juste avant le BAM : c'est la mauvaise vision, le Coran y répond. */
  hookStrike?: boolean;
  /** Taille de l'image : 1080×1920 par défaut ; 1920×1080 = paysage (TikTok propose de tourner le téléphone). */
  size?: Size;
}

export interface Composition {
  html: string;
  duration: number;
}

const OUTRO_S = 3.4;
const END_FADE_S = 0.6;

const STRINGS: Record<Lang, { surah: string; recitation: string; outroTitle: string; hadith: string; hadithRef: string }> = {
  fr: {
    surah: "Sourate",
    recitation: "Récitation",
    outroTitle: "Partage ce rappel",
    hadith: "« Celui qui indique un bien a la même récompense que celui qui le fait. »",
    hadithRef: "Rapporté par Muslim (n° 1893)",
  },
  en: {
    surah: "Surah",
    recitation: "Recitation",
    outroTitle: "Share this reminder",
    hadith: "“Whoever guides someone to goodness will have a reward like the one who does it.”",
    hadithRef: "Sahih Muslim 1893",
  },
};

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const toArabicDigits = (n: number) => String(n).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)]);

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const fix = (n: number) => n.toFixed(3);

/** Typographie française des accroches : « 1 000 000 € » et « ? » ne se séparent jamais de ce qui précède. */
const nbsp = (text: string) =>
  text
    .replace(/(\d) (?=\d{3}\b)/g, "$1\u00a0")
    .replace(/(\d) ([€$%])/g, "$1\u00a0$2")
    .replace(/ ([?!:;»])/g, "\u00a0$1")
    .replace(/« /g, "«\u00a0");

// quran.com sépare le signe de pause (waqf) du mot par une espace : on le garde, en plus discret.
const WAQF_SUFFIX = /(\s[\u06D6-\u06DB])$/;

function wordHtml(text: string): string {
  const match = WAQF_SUFFIX.exec(text);
  if (!match) return esc(text);
  return `${esc(text.slice(0, match.index))}<span class="waqf">${esc(match[1])}</span>`;
}

function arabicFontSize(letters: number): number {
  if (letters <= 14) return 104;
  if (letters <= 20) return 94;
  if (letters <= 26) return 88;
  if (letters <= 32) return 80;
  return 72;
}

function translationFontSize(chars: number): number {
  if (chars <= 90) return 44;
  if (chars <= 160) return 40;
  if (chars <= 240) return 36;
  if (chars <= 340) return 32;
  return 28;
}

function backgroundHtml(background: Background, duration: number): { html: string; sky: ReturnType<typeof generateSky> | null } {
  if (background.kind === "video" || background.kind === "montage") {
    return {
      html: `<video id="bg-video" class="clip" src="assets/background.mp4" data-start="0" data-duration="${fix(duration)}" data-track-index="0" muted playsinline></video>
    <div class="layer shade"></div>`,
      sky: null,
    };
  }
  const sky = generateSky(background.seed);
  const nebulas = sky.nebulas
    .map(
      (n) =>
        `<div id="${n.id}" class="nebula" style="left:${fix(n.x - n.size / 2)}px;top:${fix(n.y - n.size / 2)}px;width:${fix(n.size)}px;height:${fix(n.size)}px;background:radial-gradient(circle, ${n.color} 0%, rgba(0,0,0,0) 68%);"></div>`,
    )
    .join("\n      ");
  const stars = sky.stars
    .map(
      (s) =>
        `<div id="${s.id}" class="star" style="left:${fix(s.x)}px;top:${fix(s.y)}px;width:${fix(s.size)}px;height:${fix(s.size)}px;"></div>`,
    )
    .join("\n        ");
  return {
    html: `<div class="layer sky"></div>
    <div class="layer" id="nebulas">
      ${nebulas}
    </div>
    <div class="layer" id="stars">
        ${stars}
    </div>
    <div class="layer vignette"></div>`,
    sky,
  };
}

export function buildCoranTraduction(script: VideoScript, options: FormatOptions): Composition {
  const t = STRINGS[script.lang];
  const recEnd = script.recitationDuration;
  const duration = recEnd + (options.outro ? OUTRO_S : END_FADE_S);
  const { chapter, reciter } = script;
  const range = script.from === script.to ? `${script.from}` : `${script.from}-${script.to}`;

  const bg = backgroundHtml(options.background, duration);
  const hook = options.variant === "creation" && options.hookText && options.dropAt !== undefined ? options.hookText : "";
  // Avec une accroche, les versets récités avant le BAM ne s'affichent pas (l'accroche occupe l'écran).
  const ayat = hook
    ? script.ayat
        .map((a) => ({ ...a, phrases: a.phrases.filter((p) => p.showFrom >= options.dropAt! - 0.05) }))
        .filter((a) => a.phrases.length)
        .map((a) => ({ ...a, showFrom: a.phrases[0].showFrom }))
    : script.ayat;
  const creation = options.variant === "creation";
  const cinema = options.variant === "cinema";
  const width = options.size?.width ?? 1080;
  const height = options.size?.height ?? 1920;
  // Paysage : le plan occupe toute l'image, rien dans des bandes vides.
  const paysage = width > height;
  const sizeFactor = creation ? 1.08 : paysage ? 1 : cinema ? 0.72 : 1;
  const trFactor = paysage ? 1.05 : cinema ? 0.82 : 1;

  const phrasesHtml = ayat
    .flatMap((ayah) =>
      ayah.phrases.map((phrase, index) => {
        const isLast = index === ayah.phrases.length - 1;
        const letters = letterCount(phrase.words.map((w) => w.text).join(""));
        const words = phrase.words.map((w) => `<span class="w" id="${w.id}">${wordHtml(w.text)}</span>`).join(" ");
        const ayahEnd = isLast ? ` <span class="ayah-num">۝${toArabicDigits(ayah.ayah)}</span>` : "";
        return `<div id="${phrase.id}" class="phrase clip" data-start="${fix(phrase.showFrom)}" data-duration="${fix(phrase.showTo - phrase.showFrom)}" data-track-index="3">
        <p class="phrase-inner" dir="rtl" lang="ar" style="font-size:${Math.round(arabicFontSize(letters) * sizeFactor)}px">${words}${ayahEnd}</p>
      </div>`;
      }),
    )
    .join("\n      ");

  // Traduction : le morceau qui correspond à la phrase arabe à l'écran. Des phrases voisines qui partagent
  // le même morceau forment un seul bloc ; la taille du texte est fixée par verset pour ne pas sauter.
  const blocks: Array<{ id: string; from: number; to: number; text: string; ayah: TimedAyah; fontSize: number }> = [];
  for (const ayah of ayat) {
    const longest = Math.max(...ayah.phrases.map((p) => (p.translation ?? ayah.translation).length));
    for (const phrase of ayah.phrases) {
      const text = phrase.translation ?? ayah.translation;
      const last = blocks.at(-1);
      if (last && last.ayah === ayah && last.text === text) {
        last.to = phrase.showTo;
        continue;
      }
      blocks.push({ id: `t${blocks.length}`, from: phrase.showFrom, to: phrase.showTo, text, ayah, fontSize: Math.round(translationFontSize(longest) * trFactor) });
    }
  }
  const translationsHtml = blocks
    .map(
      (b) => `<div id="${b.id}" class="translation clip" data-start="${fix(b.from)}" data-duration="${fix(b.to - b.from)}" data-track-index="4">
        <p class="tr-inner">
          <span class="tr-text" style="font-size:${b.fontSize}px">${esc(b.text)}</span>
          <span class="tr-ref">${esc(chapter.nameSimple)} · ${b.ayah.key.split(":")[1]}</span>
        </p>
      </div>`,
    )
    .join("\n      ");

  const footerParts = reciter.name ? [`${t.recitation} · ${esc(reciter.name)}`] : [];
  if (options.handle) footerParts.push(esc(options.handle));

  const outroHtml = options.outro
    ? `<div id="outro" class="clip" data-start="${fix(recEnd)}" data-duration="${fix(duration - recEnd)}" data-track-index="6">
      <p id="outro-inner">
        <span class="outro-title">${esc(t.outroTitle)}</span>
        <span class="outro-hadith">${esc(t.hadith)}</span>
        <span class="outro-ref">${esc(t.hadithRef)}</span>
      </p>
    </div>`
    : "";

  const data = {
    total: duration,
    recEnd,
    dropAt: creation && options.dropAt !== undefined ? options.dropAt : null,
    strike: Boolean(hook && options.hookStrike),
    dimWords: cinema ? "rgba(255,255,255,0.88)" : creation ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.34)",
    outro: options.outro,
    phrases: ayat.flatMap((a) => a.phrases.map((p) => ({ id: p.id, from: p.showFrom, to: p.showTo }))),
    words: ayat.flatMap((a) => a.phrases.flatMap((p) => p.words.map((w) => ({ id: w.id, start: w.start, end: w.end })))),
    translations: blocks.map((b) => ({ id: b.id, from: b.from, to: b.to })),
    stars: bg.sky?.stars.map((s) => ({
      id: s.id,
      low: s.opacityLow,
      high: s.opacityHigh,
      cycle: s.cycle,
      delay: s.delay,
      repeat: Math.max(0, Math.floor((duration - s.delay) / s.cycle) - 1),
    })) ?? [],
    nebulas: bg.sky?.nebulas.map((n) => ({ id: n.id, dx: n.dx, dy: n.dy, scale: n.scale })) ?? [],
  };

  const html = `<!doctype html>
<html lang="${script.lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${esc(`${chapter.nameSimple} ${range} · ${reciter.name}`)}</title>
    <script src="assets/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Amiri Quran"; src: url("assets/fonts/AmiriQuran-Regular.ttf") format("truetype"); font-display: block; }
      @font-face { font-family: "Inter"; src: url("assets/fonts/Inter.ttf") format("truetype"); font-weight: 100 900; font-display: block; }
      @font-face { font-family: "Cormorant Garamond"; src: url("assets/fonts/CormorantGaramond.ttf") format("truetype"); font-weight: 300 700; font-display: block; }

      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #03050a; }

      .layer { position: absolute; inset: 0; }
      .sky { background: radial-gradient(ellipse 120% 80% at 50% 28%, #141c38 0%, #080b17 55%, #020308 100%); }
      .nebula { position: absolute; border-radius: 50%; }
      .star { position: absolute; border-radius: 50%; background: #fdfaf0; box-shadow: 0 0 6px rgba(255, 244, 214, 0.8); }
      .vignette { background: radial-gradient(ellipse 90% 70% at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.7) 100%); }
      #bg-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .shade { background: linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.5) 30%, rgba(0,0,0,0.62) 60%, rgba(0,0,0,0.75) 100%); }

      #header { position: absolute; top: 250px; left: 0; right: 0; text-align: center; }
      .surah-ar { font-family: "Amiri Quran", serif; font-size: 62px; line-height: 1.5; color: #e9d7a1; }
      .surah-lat { margin-top: 6px; font-family: "Inter", sans-serif; font-size: 24px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255,255,255,0.62); }
      .ornament { margin: 22px auto 0; width: 260px; height: 14px; display: flex; align-items: center; justify-content: center; gap: 14px; }
      .ornament i { display: block; width: 100px; height: 1px; background: linear-gradient(90deg, rgba(233,215,161,0), rgba(233,215,161,0.7)); }
      .ornament i:last-child { background: linear-gradient(90deg, rgba(233,215,161,0.7), rgba(233,215,161,0)); }
      .ornament b { display: block; width: 9px; height: 9px; background: #e9d7a1; transform: rotate(45deg); }

      .phrase { position: absolute; left: 80px; right: 80px; top: 520px; height: 540px; display: flex; align-items: center; justify-content: center; }
      .phrase-inner { width: 100%; font-family: "Amiri Quran", serif; line-height: 1.95; text-align: center; text-wrap: balance; color: #ffffff; text-shadow: 0 2px 18px rgba(0,0,0,0.55); }
      .waqf { font-size: 0.62em; opacity: 0.75; }
      .w { color: rgba(255,255,255,0.34); }
      .ayah-num { color: #e9d7a1; font-size: 0.8em; }

      .translation { position: absolute; left: 100px; right: 100px; top: 1080px; height: 300px; display: flex; align-items: flex-start; justify-content: center; }
      .tr-inner { width: 100%; text-align: center; }
      .tr-text { display: block; text-wrap: pretty; font-family: "Inter", sans-serif; font-weight: 500; line-height: 1.42; color: rgba(255,255,255,0.92); text-shadow: 0 2px 12px rgba(0,0,0,0.6); }
      .tr-ref { display: block; margin-top: 18px; font-family: "Inter", sans-serif; font-size: 22px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(233,215,161,0.8); }

      #footer { position: absolute; left: 0; right: 0; top: 1405px; text-align: center; font-family: "Inter", sans-serif; font-size: 24px; font-weight: 500; letter-spacing: 0.06em; color: rgba(255,255,255,0.55); }

      #outro { position: absolute; left: 110px; right: 110px; top: 600px; height: 640px; display: flex; align-items: center; justify-content: center; }
      #outro-inner { width: 100%; text-align: center; }
      .outro-title { display: block; font-family: "Cormorant Garamond", serif; font-size: 84px; font-weight: 600; font-style: italic; color: #e9d7a1; }
      .outro-hadith { display: block; text-wrap: pretty; margin-top: 34px; font-family: "Inter", sans-serif; font-size: 38px; font-weight: 500; line-height: 1.45; color: rgba(255,255,255,0.92); }
      .outro-ref { display: block; margin-top: 22px; font-family: "Inter", sans-serif; font-size: 24px; letter-spacing: 0.08em; color: rgba(255,255,255,0.55); }

      #fade { position: absolute; inset: 0; background: #000; opacity: 0; pointer-events: none; }
      #flash { position: absolute; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
      .v-creation .shade { background: linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.42) 30%, rgba(0,0,0,0.52) 60%, rgba(0,0,0,0.62) 100%); }
      .v-creation .phrase-inner { text-shadow: 0 3px 22px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.6); }
      .v-creation .w { color: rgba(255,255,255,0.6); }
      #hook { position: absolute; left: 100px; right: 100px; top: 290px; height: 380px; display: flex; align-items: center; justify-content: center; }
      #hook-box { width: 100%; text-align: center; }
      #hook-label { margin-bottom: 26px; font-family: "Inter", sans-serif; font-size: 28px; font-weight: 600; letter-spacing: 0.28em; text-transform: uppercase; color: rgba(255,255,255,0.78); text-shadow: 0 2px 12px rgba(0,0,0,0.9); }
      #hook-text { position: relative; display: inline-block; }
      #hook-strike { position: absolute; left: -3%; right: -3%; top: 50%; height: 8px; margin-top: -4px; border-radius: 4px; background: #e23b2e; box-shadow: 0 2px 10px rgba(0,0,0,0.6); }
      #hook-inner { font-variant-numeric: lining-nums; font-family: "Cormorant Garamond", serif; font-style: italic; font-weight: 600; font-size: 80px; line-height: 1.18; text-align: center; text-wrap: balance; color: #ffffff; text-shadow: 0 4px 26px rgba(0,0,0,0.95); }
      .v-cinema #bg-video { top: 580px; height: 608px; bottom: auto; }
      .v-cinema .shade { top: 580px; height: 608px; bottom: auto; background: rgba(0,0,0,0.28); }
      .v-cinema .phrase { top: 580px; height: 608px; left: 60px; right: 60px; }
      .v-cinema .phrase-inner { line-height: 1.8; text-shadow: 0 2px 14px rgba(0,0,0,0.9); }
      .v-cinema .w { color: rgba(255,255,255,0.88); }
      .v-cinema .translation { top: 1215px; height: 280px; left: 90px; right: 90px; }
      .v-paysage .shade { background: linear-gradient(180deg, rgba(0,0,0,0.26) 0%, rgba(0,0,0,0.32) 40%, rgba(0,0,0,0.58) 72%, rgba(0,0,0,0.72) 100%); }
      .v-paysage .phrase { left: 160px; right: 160px; top: 130px; height: 520px; }
      .v-paysage .phrase-inner { line-height: 1.7; text-shadow: 0 2px 18px rgba(0,0,0,0.85); }
      .v-paysage .w { color: rgba(255,255,255,0.9); }
      .v-paysage .translation { left: 230px; right: 230px; top: 680px; height: 260px; }
      .v-paysage .tr-text { text-shadow: 0 2px 14px rgba(0,0,0,0.9); }
      .v-paysage #footer { top: 1004px; font-size: 20px; }
      .v-paysage #outro { left: 380px; right: 380px; top: 180px; height: 720px; }
      .scrim { background: radial-gradient(ellipse 95% 36% at 50% 46%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.28) 55%, rgba(0,0,0,0) 82%); }
      .v-creation .tr-text { text-shadow: 0 2px 14px rgba(0,0,0,0.9); }
    </style>
  </head>
  <body>
    <div id="root" class="${paysage ? "v-paysage" : creation ? "v-creation" : cinema ? "v-cinema" : "v-classique"}" data-composition-id="main" data-start="0" data-width="${width}" data-height="${height}" data-duration="${fix(duration)}" data-fps="30">
    ${bg.html}
      ${creation ? '<div class="layer scrim"></div>' : ""}

      ${creation || cinema || paysage ? "" : `<div id="header">
        <div id="header-inner">
          <div class="surah-ar" dir="rtl" lang="ar">سُورَةُ ${esc(chapter.nameArabic)}</div>
          <div class="surah-lat">${esc(chapter.nameSimple)} · ${esc(chapter.translatedName)}</div>
          <div class="ornament"><i></i><b></b><i></i></div>
        </div>
      </div>`}

      ${hook ? `<div id="hook" class="clip" data-start="0" data-duration="${fix(options.dropAt!)}" data-track-index="5"><div id="hook-box">${options.hookLabel ? `<p id="hook-label">${esc(options.hookLabel)}</p>` : ""}<div id="hook-text"><p id="hook-inner">${esc(nbsp(hook))}</p>${options.hookStrike ? '<span id="hook-strike"></span>' : ""}</div></div></div>` : ""}

      ${phrasesHtml}

      ${translationsHtml}

      ${(cinema && !paysage) || !footerParts.length ? "" : `<div id="footer"><div id="footer-inner">${footerParts.join(" · ")}</div></div>`}

      ${outroHtml}

      <audio id="recitation" src="assets/audio.m4a" data-start="0" data-duration="${fix(options.fullLengthAudio ? duration : recEnd)}" data-track-index="10" data-volume="1"></audio>

      ${creation ? '<div id="flash"></div>' : ""}
      <div id="fade"></div>
    </div>

    <script>
      const D = ${JSON.stringify(data)};
      // Sur un fond vidéo chargé, les mots pas encore récités restent plus lisibles.
      const DIM = D.dimWords;
      const GOLD = "#f3d98b";
      const WHITE = "#ffffff";
      const NO_GLOW = "0 0 0px rgba(243,217,139,0)";
      const GLOW = "0 0 26px rgba(243,217,139,0.7)";
      const tl = gsap.timeline({ paused: true });
      const later = { immediateRender: false };

      // Fond : dérive lente du ciel, étoiles qui scintillent.
      if (D.stars.length) {
        tl.fromTo("#stars", { y: 0, scale: 1 }, { y: -70, scale: 1.08, duration: D.total, ease: "none" }, 0);
        D.nebulas.forEach((n) => {
          tl.fromTo("#" + n.id, { x: 0, y: 0, scale: 1 }, { x: n.dx, y: n.dy, scale: n.scale, duration: D.total, ease: "sine.inOut" }, 0);
        });
        D.stars.forEach((s) => {
          tl.fromTo("#" + s.id, { opacity: s.low }, { opacity: s.high, duration: s.cycle / 2, ease: "sine.inOut", yoyo: true, repeat: s.repeat * 2 + 1 }, s.delay);
        });
      }

      // Ouverture : ce qui est là au début est affiché d'office, sans animation d'entrée,
      // pour que la toute première image soit pleine (TikTok s'en sert comme couverture).
      const OPENING = 0.35;


      // La « vision du monde » est barrée d'un trait rouge juste avant que le Coran ne réponde.
      if (D.strike && D.dropAt !== null) {
        tl.fromTo("#hook-strike", { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: 0.4, ease: "power2.out" }, Math.max(0.5, D.dropAt - 0.8));
      }

      // BAM (variante création) : flash blanc et la phrase qui arrive frappe l'écran.
      if (D.dropAt !== null) {
        tl.fromTo("#flash", { opacity: 0 }, { opacity: 0.9, duration: 0.06, ease: "none" }, D.dropAt);
        tl.fromTo("#flash", { opacity: 0.9 }, { opacity: 0, duration: 0.45, ease: "power2.out", ...later }, D.dropAt + 0.06);
        const hit = D.phrases.find((p) => Math.abs(p.from - D.dropAt) < 0.05);
        if (hit) tl.fromTo("#" + hit.id + " .phrase-inner", { scale: 1.35 }, { scale: 1, duration: 0.6, ease: "expo.out" }, D.dropAt);
      }

      // Phrases arabes : apparition douce, puis chaque mot s'allume quand il est récité.
      D.phrases.forEach((p) => {
        const inner = "#" + p.id + " .phrase-inner";
        if (p.from >= OPENING) tl.fromTo(inner, { opacity: 0, y: 22, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.38, ease: "power2.out" }, p.from);
        tl.fromTo(inner, { opacity: 1, y: 0, filter: "blur(0px)" }, { opacity: 0, y: -14, filter: "blur(6px)", duration: 0.24, ease: "power1.in", ...later }, Math.max(p.from + 0.4, p.to - 0.24));
      });
      D.words.forEach((w) => {
        tl.fromTo("#" + w.id, { color: DIM, textShadow: NO_GLOW }, { color: GOLD, textShadow: GLOW, duration: 0.12, ease: "none" }, w.start);
        tl.fromTo("#" + w.id, { color: GOLD, textShadow: GLOW }, { color: WHITE, textShadow: NO_GLOW, duration: 0.35, ease: "power1.out", ...later }, Math.max(w.end, w.start + 0.12));
      });

      // Traduction de la phrase en cours : elle arrive avec l'arabe.
      D.translations.forEach((a) => {
        const inner = "#" + a.id + " .tr-inner";
        if (a.from >= OPENING) tl.fromTo(inner, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }, a.from + 0.05);
        tl.fromTo(inner, { opacity: 1, y: 0 }, { opacity: 0, y: -8, duration: 0.22, ease: "power1.in", ...later }, Math.max(a.from + 0.45, a.to - 0.22));
      });

      // Fin : titres qui s'effacent, carton « partage », fondu au noir.
      tl.fromTo(document.querySelectorAll("#header-inner, #footer-inner"), { opacity: 1 }, { opacity: 0, duration: 0.4, ease: "power1.in", ...later }, D.recEnd - 0.2);
      if (D.outro) {
        tl.fromTo("#outro-inner", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, D.recEnd + 0.15);
      }
      tl.fromTo("#fade", { opacity: 0 }, { opacity: 1, duration: ${END_FADE_S}, ease: "power1.in", ...later }, D.total - ${END_FADE_S});

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;

  return { html, duration };
}
