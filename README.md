# Hasanat

Un kit gratuit pour fabriquer soi-même des vidéos courtes de Coran (TikTok, Instagram Reels, YouTube Shorts) et les partager.

Une commande produit une vidéo verticale prête à publier : la récitation d'un grand récitateur, le texte arabe qui s'illumine mot à mot en suivant sa voix, la traduction du verset, et la légende avec les hashtags.

> « Celui qui indique un bien a la même récompense que celui qui le fait. » — Muslim, n° 1893

## Le plus simple : demander à Claude

Tu as Claude ? Tu n'as rien à apprendre.

1. Sur ton ordinateur (Mac ou Windows), ouvre l'application Claude et va dans l'onglet **Code** (Claude Code).
2. Envoie-lui ce document : **[HASANAT_POUR_CLAUDE.md](https://raw.githubusercontent.com/latifanis95-arch/hasanat/main/HASANAT_POUR_CLAUDE.md)** (le lien suffit), avec ce message :

   > Voici le document, installe-moi l'outil.

Claude installe tout pas à pas, te demande les clés gratuites, fait une première vidéo avec toi, puis tu n'as plus qu'à lui demander : « fais-moi une vidéo sur la patience », « un verset sur la mort, voix Yasser Al-Dosari »…

Lien direct du document à partager :
`https://raw.githubusercontent.com/latifanis95-arch/hasanat/main/HASANAT_POUR_CLAUDE.md`

## Ce que fait le kit

- **Le Coran tel qu'il est** : texte uthmani, traductions (Muhammad Hamidullah en français, Saheeh International en anglais) et récitations viennent de [quran.com](https://quran.com). Ni le texte ni la voix ne viennent d'une IA.
- **De vrais récitateurs** : Yasser Al-Dosari, Mishary Alafasy, Abdur-Rahman As-Sudais, Saud Ash-Shuraim, Al-Minshawi, Al-Husary, Abdul Basit…
- **Jamais de musique** : seulement des sons de la nature (pluie, vagues, ruisseau, oiseaux), bien en dessous de la voix, ou le silence.
- **Des fonds sûrs** : un ciel étoilé dessiné par le moteur, ou des vidéos de nature Pixabay vérifiées une à une (ni personne, ni texte, ni construction, ni symbole religieux).
- **81 passages classés par thème** (patience, espoir, la mort, le pardon, la prière, la gratitude…), choisis et relus sur quran.com.
- **Une légende prête à copier**, avec la sourate, les versets, le récitateur, le traducteur et les hashtags.

## Installation (à la main)

Il faut : un ordinateur (Mac, Windows ou Linux), [Node.js](https://nodejs.org) 22.18 ou plus récent (version LTS), [FFmpeg](https://ffmpeg.org), et environ 8 Go de place libre.

- **Mac** : installe [Homebrew](https://brew.sh), puis `brew install node ffmpeg`.
- **Windows** : `winget install OpenJS.NodeJS.LTS` puis `winget install Gyan.FFmpeg`, et rouvre le terminal.

Puis :

```bash
git clone https://github.com/latifanis95-arch/hasanat.git ~/hasanat
cd ~/hasanat
npm install
npm run ambiances    # télécharge les ambiances (pluie, vagues, oiseaux…), une seule fois
npm run verifier     # contrôle l'installation
npm run video -- --passage raad-28
```

La vidéo (`.mp4`, 1080×1920) et sa légende (`.txt`) arrivent dans le dossier `output/`.

### Les clés (gratuites, facultatives)

Copie `.env.example` en `.env` et colle tes clés. Ce fichier reste sur ton ordinateur.

| Clé | À quoi elle sert | Où la créer |
| --- | --- | --- |
| `PIXABAY_API_KEY` | les fonds vidéo de nature (sans elle : ciel étoilé seulement) | crée un compte sur [pixabay.com](https://pixabay.com), la clé s'affiche sur [pixabay.com/api/docs](https://pixabay.com/api/docs/) (rubrique « Parameters », champ `key`) |
| `GEMINI_API_KEY` | vérifier chaque nouveau plan vidéo et accorder l'ambiance à l'image | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → « Create API key » |

Sans clé Gemini, le kit n'utilise que des plans de nature **déjà vérifiés** (`data/plans-verifies.json`, plus de 350 plans) : c'est sûr.

## Exemples

```bash
npm run video -- --passage raad-28                           # un passage de la bibliothèque
npm run video -- --theme patience                            # un passage au hasard sur ce thème
npm run video -- --theme mort --reciter yasser               # avec un récitateur précis
npm run video -- --ref 39:53 --reciter alafasy --lang en     # n'importe quel verset, en anglais
npm run video -- --passage zumar-53 --bg nature:mer          # sur un plan de mer (clé Pixabay)
npm run video -- --format creation --passage muminun-84-89   # intro étouffée puis « BAM » et la création
npm run video -- --passage kahf-10 --handle @moncompte       # ton nom de compte en filigrane
```

Commandes utiles :

```bash
npm run passages              # la bibliothèque (-- --theme mort pour filtrer)
npm run themes                # les thèmes
npm run reciters              # les récitateurs
npm run formats               # les formats
npm run fonds                 # les fonds possibles (ciel étoilé, nature:mer, nature:montagne…)
npm run verset -- --ref 67:1-2   # texte arabe + traduction de quran.com, pour vérifier le sens
npm run menage                # libère la place prise par les fichiers temporaires
```

## Formats

| Format | Id | Clé Pixabay |
| --- | --- | --- |
| Coran à l'écrit + traduction (par défaut) | `coran-traduction` | non (ciel étoilé) |
| Coran à l'écrit + traduction en 16:9 | `coran-cinema` | oui |
| La création d'Allah : intro étouffée puis BAM et montage de la création | `creation` | oui |
| Citation + Coran | `citation-coran` | oui |
| Invitation à écouter | `invitation-ecoute` | oui |
| Nature + Coran, sans texte (16:9) | `nature-coran` | oui |
| Surligné : page de papier, phrase surlignée | `surligne` | oui |

## Règles

Le kit suit des [principes non négociables](docs/principes.md) : un vrai récitateur seulement, jamais de musique ni d'instrument, jamais de verset ni de traduction inventés, aucune représentation des prophètes ni des compagnons, aucune promesse de récompense (la récompense est auprès d'Allah). Le kit ne publie rien à ta place : c'est toi qui postes.

## Sources et licences

- Texte, traductions, récitations et minutage mot à mot : [quran.com](https://quran.com) (Quran Foundation).
- Fonds vidéo et textures de papier : [Pixabay](https://pixabay.com) (licence Pixabay), téléchargés chez toi, jamais redistribués ici.
- Ambiances : [Wikimedia Commons](https://commons.wikimedia.org), CC0 ou domaine public (sources dans `data/ambiances.json`), téléchargées chez toi.
- Polices : Amiri Quran, Inter, Cormorant Garamond, Caveat, sous licence SIL Open Font License (fichiers `assets/fonts/OFL-*.txt`).
- Rendu vidéo : [HyperFrames](https://github.com/heygen-com/hyperframes) (Apache-2.0) et [GSAP](https://gsap.com), installés par `npm install`.

---

## English

**Hasanat** is a free kit to make short Quran videos (TikTok, Reels, Shorts) yourself: a real reciter from quran.com, the Arabic text lighting up word by word with the recitation, the translation (Saheeh International in English, Hamidullah in French), and a ready-to-paste caption. No music, no AI voice, no invented verses, no depiction of prophets or companions; backgrounds are a generated starry sky or vetted nature footage from Pixabay.

**Easiest way:** open the **Code** tab of the Claude desktop app (Claude Code) and send it [HASANAT_POUR_CLAUDE.md](https://raw.githubusercontent.com/latifanis95-arch/hasanat/main/HASANAT_POUR_CLAUDE.md) with "Here is the document, install the tool for me." Claude will guide you step by step (the guide is in French; Claude will answer in your language).

**Manual install:** Node.js 22.18+ and FFmpeg, then `git clone https://github.com/latifanis95-arch/hasanat.git && cd hasanat && npm install && npm run ambiances && npm run video -- --passage raad-28 --lang en`. Optional free keys go in `.env` (see `.env.example`): `PIXABAY_API_KEY` for nature backgrounds, `GEMINI_API_KEY` to vet new footage.
