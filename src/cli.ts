// Point d'entrée : `npm run video -- --passage raad-28` (voir README).
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadAmbiances, prepareAmbiances } from "./ambiances.ts";
import { LANDSCAPE, type Lang, loadSettings, PATHS, type Quality, VIDEO } from "./config.ts";
import { FORMATS, getFormat } from "./formats/index.ts";
import { geminiConfigured } from "./lib/gemini.ts";
import { cleanBuilds, dirSize, go, maxCacheBytes, trimPixabay } from "./menage.ts";
import { CATEGORIES, loadPlans } from "./plans.ts";
import { type ProduceContext, produceAmbiance, produceCoran } from "./produce.ts";
import { produceSurligne } from "./produce-surligne.ts";
import { getChapter, getTranslationName, getVerse } from "./quran/api.ts";
import { getReciter, RECITERS } from "./quran/reciters.ts";
import { buildDir } from "./render.ts";
import { buildScript, previewPhrases } from "./script.ts";
import { loadPassages, type PassageInfo, passagesFor, themesWithCounts } from "./sujets.ts";
import { prepareTextures } from "./textures.ts";
import { verifier } from "./verifier.ts";

/** "23:84-89" ou "18:14" → { surah, from, to } */
function parseRef(ref: string): { surah: number; from: number; to: number } {
  const match = /^(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/.exec(ref.trim());
  if (!match) throw new Error(`Référence invalide « ${ref} ». Exemples : 23:84-89, 18:14`);
  const surah = Number(match[1]);
  const from = Number(match[2]);
  const to = match[3] ? Number(match[3]) : from;
  if (surah < 1 || surah > 114) throw new Error(`Sourate invalide : ${surah}`);
  if (to < from) throw new Error(`Référence invalide « ${ref} » : le dernier verset est avant le premier.`);
  if (to - from > 30) throw new Error(`Passage trop long (${to - from + 1} versets) pour une vidéo courte : 30 versets au plus.`);
  return { surah, from, to };
}

async function make(args: string[]): Promise<void> {
  const settings = loadSettings();
  const { values } = parseArgs({
    args,
    options: {
      ref: { type: "string" },
      passage: { type: "string" },
      theme: { type: "string" },
      reciter: { type: "string" },
      lang: { type: "string" },
      format: { type: "string", default: "coran-traduction" },
      bg: { type: "string" },
      texte: { type: "string" },
      accroche: { type: "string" },
      orientation: { type: "string" },
      surligne: { type: "string" },
      seed: { type: "string" },
      handle: { type: "string" },
      quality: { type: "string" },
      ambiance: { type: "string" },
      "ambiance-volume": { type: "string" },
      drop: { type: "string" },
      coupe: { type: "string" },
      "no-outro": { type: "boolean", default: false },
      "no-render": { type: "boolean", default: false },
      garder: { type: "boolean", default: false },
    },
  });

  const format = getFormat(values.format!);
  const lang = (values.lang ?? settings.lang) as Lang;
  if (lang !== "fr" && lang !== "en") throw new Error("--lang doit valoir fr ou en.");
  // Traductions fixées : Hamidullah (français) et Saheeh International (anglais), publiées sur quran.com.
  const translationId = settings.translations[lang];
  const quality = (values.quality ?? settings.quality) as Quality;
  if (!["draft", "looks", "delivery"].includes(quality)) throw new Error("--quality : draft, looks ou delivery.");
  if (format.needsPixabay && !process.env.PIXABAY_API_KEY?.trim()) {
    throw new Error(`Le format « ${format.id} » a besoin de la clé Pixabay (gratuite : https://pixabay.com/api/docs/, à mettre dans .env). Sans clé : --format coran-traduction (ciel étoilé).`);
  }
  if (values.bg && values.bg !== "stars" && values.bg !== "random" && !process.env.PIXABAY_API_KEY?.trim() && (values.bg === "nature" || values.bg.startsWith("nature:") || values.bg.startsWith("pixabay:"))) {
    throw new Error("Ce fond vient de Pixabay : ajoute la clé PIXABAY_API_KEY dans .env (gratuite : https://pixabay.com/api/docs/), ou garde le ciel étoilé (sans --bg).");
  }
  // « auto » (réglage par défaut) : une ambiance accordée au plan de fond. « aucune » la coupe.
  const asked = values.ambiance ?? settings.ambiance;
  const ambiance = asked === "aucune" || asked === "none" ? "" : asked;
  const ambianceDb = values["ambiance-volume"] !== undefined ? Number(values["ambiance-volume"]) : settings.ambianceVolume;
  if (ambiance && ambiance !== "auto" && !loadAmbiances().some((a) => a.id === ambiance)) throw new Error(`Ambiance inconnue « ${ambiance} ». Voir \`npm run ambiances -- --liste\`.`);
  if (ambiance) {
    const ready = fs.existsSync(path.join(PATHS.ambiances, "pluie-douce.m4a"));
    if (!ready) throw new Error("Les ambiances ne sont pas encore prêtes : lance `npm run ambiances` (une seule fois), ou ajoute --ambiance aucune.");
  }

  // Le passage : donné (--passage), une référence libre (--ref) ou choisi dans un thème (--theme).
  let passage: PassageInfo | undefined;
  if (values.passage) {
    passage = loadPassages().find((p) => p.id === values.passage);
    if (!passage) throw new Error(`Passage inconnu « ${values.passage} ». Voir \`npm run passages\`.`);
  } else if (values.theme && !values.ref) {
    const theme = values.theme.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const choices = passagesFor(theme, format.id, lang);
    if (!choices.length) throw new Error(`Aucun passage pour le thème « ${values.theme} » avec le format ${format.id}. Voir \`npm run themes\`.`);
    const pick = values.seed ? Number(values.seed) : Math.floor(Math.random() * 1e6);
    passage = choices[pick % choices.length];
    console.log(`  Thème « ${theme} » : passage ${passage.id} (${passage.ref}) parmi ${choices.length}. Pour refaire le même : --passage ${passage.id}`);
  }
  const ref = values.ref ?? passage?.ref;
  if (!ref) throw new Error("Indique --passage (voir `npm run passages`), --theme (voir `npm run themes`) ou --ref (ex. 23:84-89).");
  const { surah, from, to } = parseRef(ref);
  if (format.id === "creation" && to === from) throw new Error("Le format « creation » demande un passage d'au moins 2 versets (le BAM tombe au 2e).");
  const reciter = getReciter(values.reciter ?? settings.reciter);

  const pad = (n: number) => String(n).padStart(3, "0");
  const slug = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const orientation = values.orientation ?? format.orientation ?? "portrait";
  if (orientation !== "portrait" && orientation !== "paysage") throw new Error("--orientation : portrait ou paysage.");
  const frame = orientation === "paysage" ? LANDSCAPE : { width: VIDEO.width, height: VIDEO.height };
  const date = new Date().toISOString().slice(0, 10);
  const bgTag = values.bg && values.bg !== "stars" ? `_${slug(values.bg)}` : "";
  const id = `${date}_${format.id}_${pad(surah)}-${pad(from)}-${pad(to)}_${reciter.slug}_${lang}${bgTag}${orientation === "paysage" ? "_16x9" : ""}`;
  const dir = buildDir(id);
  fs.rmSync(dir, { recursive: true, force: true });
  const workDir = path.join(dir, "assets");

  console.log(`→ ${format.name} · ${ref} · ${reciter.name} · ${lang}${ambiance ? ` · ambiance ${ambiance}` : ""}${geminiConfigured() ? "" : " · fonds : plans déjà vérifiés"}`);
  const script = await buildScript({ surah, from, to, reciter, lang, translationId, workDir });
  const phraseCount = script.ayat.reduce((n, a) => n + a.phrases.length, 0);
  console.log(`  ${script.chapter.nameSimple} ${script.from === script.to ? script.from : `${script.from}-${script.to}`} · ${script.ayat.length} verset(s), ${phraseCount} phrase(s), récitation ${script.recitationDuration.toFixed(1)} s`);

  const ctx: ProduceContext = {
    settings,
    format,
    script,
    dir,
    id,
    lang,
    seed: values.seed ? Number(values.seed) : script.chapter.id * 1000 + script.from,
    quality,
    noRender: values["no-render"],
    handle: values.handle ?? settings.handle,
    outro: settings.outro && !values["no-outro"],
    bg: values.bg,
    text: values.texte,
    hook: values.accroche,
    ambiance: ambiance || undefined,
    ambianceDb,
    drop: values.drop ?? passage?.drop,
    cut: values.coupe ? Number(values.coupe) : undefined,
    montageThemes: passage?.montage,
    captionHook: passage?.hook[lang],
    frame,
    highlight: values.surligne ?? passage?.surligne?.[lang],
  };
  let out: string | null;
  if (format.kind === "coran") out = await produceCoran(ctx);
  else if (format.kind === "surligne") out = await produceSurligne(ctx);
  else out = await produceAmbiance(ctx);

  // Légende prête à copier, et ménage : fichiers intermédiaires effacés, réserve de plans sous sa taille maximale.
  const captionFile = path.join(PATHS.output, `${ctx.id}.txt`);
  if (fs.existsSync(captionFile)) {
    console.log("\n----- Légende à copier -----");
    console.log(fs.readFileSync(captionFile, "utf8").trim());
    console.log("----------------------------");
  }
  if (out && !values.garder) {
    fs.rmSync(ctx.dir, { recursive: true, force: true });
    const freed = trimPixabay();
    if (freed) console.log(`  Ménage : ${go(freed)} de vieux plans effacés (réserve limitée à ${go(maxCacheBytes())}).`);
  }
}

/** Affiche le découpage des versets en phrases, sans rendu (pour vérifier un passage). */
async function phrases(args: string[]): Promise<void> {
  const settings = loadSettings();
  const { values } = parseArgs({
    args,
    options: { ref: { type: "string" }, passage: { type: "string" }, reciter: { type: "string" }, lang: { type: "string" }, all: { type: "boolean", default: false } },
  });
  const passages = loadPassages();
  const refs = values.all
    ? passages.map((p) => p.ref)
    : [values.ref ?? passages.find((p) => p.id === values.passage)?.ref].filter((r): r is string => Boolean(r));
  if (!refs.length) throw new Error("Indique --ref, --passage ou --all.");
  const reciter = getReciter(values.reciter ?? settings.reciter);
  const lang = (values.lang ?? settings.lang) as Lang;
  for (const ref of refs) {
    const { surah, from, to } = parseRef(ref);
    const verses = await previewPhrases({ surah, from, to, reciter, lang, translationId: settings.translations[lang] });
    for (const verse of verses) console.log(`${verse.key.padEnd(7)} ${verse.phrases.join("  |  ")}`);
  }
}

/** Texte arabe et traduction d'un passage, tels que quran.com les donne : pour vérifier le sens AVANT de faire la vidéo. */
async function verset(args: string[]): Promise<void> {
  const settings = loadSettings();
  const { values } = parseArgs({ args, options: { ref: { type: "string" }, passage: { type: "string" }, lang: { type: "string" } } });
  const ref = values.ref ?? loadPassages().find((p) => p.id === values.passage)?.ref;
  if (!ref) throw new Error("Indique --ref (ex. 67:1-2) ou --passage.");
  const lang = (values.lang ?? settings.lang) as Lang;
  const { surah, from, to } = parseRef(ref);
  const translationId = settings.translations[lang];
  const [chapter, translationName] = await Promise.all([getChapter(surah, lang), getTranslationName(translationId)]);
  console.log(`${chapter.nameSimple} (${chapter.translatedName}) ${surah}:${from}${to !== from ? `-${to}` : ""} · ${translationName} · source : quran.com`);
  let words = 0;
  for (let ayah = from; ayah <= to; ayah++) {
    if (ayah > chapter.versesCount) throw new Error(`La sourate ${chapter.nameSimple} n'a que ${chapter.versesCount} versets.`);
    const v = await getVerse(surah, ayah, translationId);
    words += v.words.length;
    console.log(`\n${v.key}  ${v.words.map((w) => w.text).join(" ")}`);
    console.log(`        ${v.translation}`);
  }
  console.log(`\n${words} mots arabes ≈ ${Math.round(words * 1.1)} à ${Math.round(words * 1.6)} s de récitation.`);
}

async function ambiances(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { liste: { type: "boolean", default: false } } });
  if (values.liste) {
    for (const a of loadAmbiances()) {
      const ready = fs.existsSync(path.join(PATHS.ambiances, `${a.id}.m4a`)) ? "✓" : "…";
      console.log(`${ready} ${a.id.padEnd(14)} ${a.label}  [${a.license}]`);
    }
    return;
  }
  console.log("Ambiances (enregistrements naturels de Wikimedia Commons, CC0 ou domaine public, jamais de musique) :");
  await prepareAmbiances();
  await prepareTextures();
  console.log("✓ Prêt.");
}

function listReciters(): void {
  for (const r of RECITERS) console.log(`${r.slug.padEnd(22)} ${r.name} (${r.nameAr}) · ${r.style}`);
}

function listPassages(args: string[]): void {
  const { values } = parseArgs({ args, options: { theme: { type: "string" }, format: { type: "string" }, lang: { type: "string" } } });
  const lang = (values.lang ?? loadSettings().lang) as Lang;
  const list = values.theme ? passagesFor(values.theme, values.format ?? "coran-traduction", lang) : loadPassages();
  for (const p of list) console.log(`${p.id.padEnd(18)} ${p.ref.padEnd(10)} ${p.hook[lang]}  [${p.themes.join(", ")}]`);
  if (!list.length) console.log(`Aucun passage pour « ${values.theme} ». Voir npm run themes.`);
}

function listThemes(): void {
  for (const t of themesWithCounts()) console.log(`${t.id.padEnd(12)} ${t.label} (${t.count} passage${t.count > 1 ? "s" : ""})`);
  console.log("\nExemple : npm run video -- --theme patience");
}

function listFormats(): void {
  for (const f of FORMATS) console.log(`${f.id.padEnd(18)} ${f.name}${f.needsPixabay ? " [clé Pixabay]" : " [sans clé]"}\n${"".padEnd(18)} ${f.description}`);
}

function listFonds(): void {
  const { nature, ambiance } = loadPlans();
  console.log("Fonds (--bg) :");
  console.log(`  ${"stars".padEnd(16)} ciel étoilé généré (par défaut, aucune clé)`);
  console.log(`  ${"nature".padEnd(16)} un plan de nature déjà vérifié, au hasard (clé Pixabay)`);
  for (const [id, c] of Object.entries(CATEGORIES)) {
    const n = nature.filter((p) => p.c.includes(id)).length;
    console.log(`  ${`nature:${id}`.padEnd(16)} ${c.label} (${n} plans vérifiés)`);
  }
  console.log(`  ${"pixabay:<mots>".padEnd(16)} recherche libre en anglais, ex. pixabay:rain window (sans clé Gemini : seulement parmi les plans vérifiés)`);
  console.log(`  ${"random".padEnd(16)} une de tes vidéos de assets/backgrounds/`);
  console.log(`\n${nature.length + ambiance.length} plans vérifiés (ni personne, ni texte). Exemple : npm run video -- --passage raad-28 --bg nature:mer`);
}

async function menage(): Promise<void> {
  const builds = cleanBuilds();
  const before = dirSize(path.join(PATHS.cache, "pixabay"));
  trimPixabay(0);
  console.log(`✓ Fichiers de rendu effacés : ${go(builds)}`);
  console.log(`✓ Plans vidéo en réserve effacés : ${go(before)} (ils seront retéléchargés si besoin)`);
  console.log("  Tes vidéos finies (dossier output/) ne sont pas touchées.");
}

const HELP = `Usage :
  npm run video -- --passage raad-28
  npm run video -- --theme patience --reciter alafasy
  npm run video -- --ref 39:53 --lang en --bg nature:mer

Options de « video » :
  --passage <id>          passage de la bibliothèque (npm run passages)
  --theme <thème>         un passage au hasard de ce thème (npm run themes)
  --ref 23:84-89          sourate:verset(s), n'importe quel passage (30 versets au plus)
  --reciter <nom>         récitateur (npm run reciters), ex. yasser, alafasy, sudais
  --lang fr|en            langue de la traduction (Hamidullah en français, Saheeh International en anglais)
  --format <id>           habillage (npm run formats), coran-traduction par défaut
  --bg <fond>             stars (défaut), nature, nature:<catégorie>, pixabay:<mots>, random (npm run fonds)
  --ambiance <id|auto|aucune>  fond sonore naturel (auto par défaut : accordé à l'image ; npm run ambiances -- --liste)
  --ambiance-volume <dB>  volume de l'ambiance (+2 par défaut ; -6 plus discret)
  --texte "…"             phrase des formats citation-coran et invitation-ecoute
  --accroche "…"          phrase affichée avant le BAM (format creation)
  --handle @compte        ton nom de compte en filigrane
  --orientation portrait|paysage
  --quality draft|looks|delivery   draft : rendu rapide pour essayer
  --seed <nombre>         autre tirage (fond, passage du thème)
  --no-outro              sans carton final « Partage ce rappel »

Autres commandes :
  npm run verifier        contrôle l'installation (sans afficher les clés)
  npm run ambiances       prépare les ambiances et les textures (une seule fois)
  npm run passages        bibliothèque de passages (-- --theme mort pour filtrer)
  npm run themes          thèmes disponibles
  npm run reciters        récitateurs
  npm run formats         formats
  npm run fonds           fonds vidéo possibles
  npm run verset -- --ref 67:1-2   texte arabe + traduction (quran.com), pour vérifier le sens avant la vidéo
  npm run phrases -- --passage kahf-13-14   découpage des versets à l'écran, sans rendu
  npm run menage          libère la place prise par les fichiers temporaires`;

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "make") await make(rest);
  else if (command === "phrases") await phrases(rest);
  else if (command === "verset") await verset(rest);
  else if (command === "ambiances") await ambiances(rest);
  else if (command === "reciters") listReciters();
  else if (command === "passages") listPassages(rest);
  else if (command === "themes") listThemes();
  else if (command === "formats") listFormats();
  else if (command === "fonds") listFonds();
  else if (command === "verifier") await verifier();
  else if (command === "menage") await menage();
  else console.log(HELP);
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
