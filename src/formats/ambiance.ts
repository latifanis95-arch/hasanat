// Formats « ambiance » (exemples : Citation + Coran, Invitation à écouter, Nature + Coran) :
// un plan vidéo plein écran, la récitation, et au plus une courte phrase discrète au centre.
import type { Size } from "../config.ts";
import type { Composition } from "./coran-traduction.ts";

export interface AmbianceOptions {
  duration: number;
  /** Phrase affichée (citation, invitation) ; vide pour « Nature + Coran ». */
  text: string;
  /** Référence discrète en bas de l'écran (ex. « Al-Kahf · 14 »), vide pour aucune. */
  reference: string;
  /** Taille de l'image (1080×1920 par défaut). */
  size?: Size;
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildAmbiance(options: AmbianceOptions): Composition {
  const { duration, text, reference } = options;
  const width = options.size?.width ?? 1080;
  const height = options.size?.height ?? 1920;
  const px = (ratio: number, of: number) => `${Math.round(ratio * of)}px`;
  const fix = (n: number) => n.toFixed(3);
  const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>Ambiance</title>
    <script src="assets/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Inter"; src: url("assets/fonts/Inter.ttf") format("truetype"); font-weight: 100 900; font-display: block; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; }
      #bg-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .scrim { position: absolute; inset: 0; background: radial-gradient(ellipse 80% 22% at 50% 44%, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 100%); }
      #quote { position: absolute; left: ${px(0.139, width)}; right: ${px(0.139, width)}; top: ${px(0.396, height)}; text-align: center; }
      #quote p { font-family: "Inter", sans-serif; font-size: 36px; font-weight: 500; line-height: 1.35; color: #ffffff; text-wrap: balance; text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 18px rgba(0,0,0,0.6); }
      #reference { position: absolute; left: 0; right: 0; top: ${px(0.693, height)}; text-align: center; font-family: "Inter", sans-serif; font-size: 22px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.55); text-shadow: 0 1px 4px rgba(0,0,0,0.9); }
      #fade { position: absolute; inset: 0; background: #000; opacity: 0; pointer-events: none; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="${width}" data-height="${height}" data-duration="${fix(duration)}" data-fps="30">
      <video id="bg-video" class="clip" src="assets/background.mp4" data-start="0" data-duration="${fix(duration)}" data-track-index="0" muted playsinline></video>
      ${text ? `<div class="scrim"></div>\n      <div id="quote"><p>${esc(text)}</p></div>` : ""}
      ${reference ? `<div id="reference">${esc(reference)}</div>` : ""}
      <audio id="recitation" src="assets/audio.m4a" data-start="0" data-duration="${fix(duration)}" data-track-index="10" data-volume="1"></audio>
      <div id="fade"></div>
    </div>
    <script>
      const total = ${fix(duration)};
      const tl = gsap.timeline({ paused: true });
      // Phrase et référence sont affichées d'office : la première image, qui sert de couverture sur TikTok, est complète.
      tl.fromTo("#fade", { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power1.in", immediateRender: false }, total - 0.6);
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
  return { html, duration };
}
