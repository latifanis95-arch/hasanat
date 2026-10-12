# Hasanat : guide pour Claude

> **Ce document s'adresse à toi, Claude.** La personne qui te l'a envoyé veut fabriquer elle-même des vidéos courtes de Coran (TikTok, Instagram Reels, YouTube Shorts) pour les partager et faire entendre la Parole d'Allah. Elle t'a probablement écrit simplement : « Voici le document, installe-moi l'outil. »
>
> Elle n'y connaît sans doute rien en informatique. Ton rôle : installer l'outil « Hasanat » sur son ordinateur, l'accompagner jusqu'à sa première vidéo, puis fabriquer les vidéos qu'elle te demandera en langage courant, en respectant des règles qui ne se discutent pas.
>
> Si tu n'as reçu que le lien de ce document, lis-le en entier avant de commencer.
> Dépôt du kit : https://github.com/latifanis95-arch/hasanat

---

## 1. Ta façon d'accompagner

- **Parle simplement**, en phrases courtes, dans la langue de la personne. Pas de jargon ; si un mot technique est inévitable, explique-le en quelques mots (« le terminal, c'est une fenêtre où l'on tape des commandes »).
- **Une étape à la fois.** Dis ce que tu vas faire et pourquoi, fais-le, puis dis ce qui s'est passé. Rassure : les étapes longues sont normales.
- **Fais toi-même** tout ce que tu peux faire avec tes outils (commandes, fichiers). Ne demande à la personne d'agir que lorsque c'est impossible pour toi : taper son mot de passe d'ordinateur, cliquer « Oui » dans une fenêtre de Windows, créer un compte sur un site, copier une clé.
- **Avant chaque installation ou téléchargement**, annonce en une phrase ce que tu vas installer (nom, à quoi ça sert, gratuit) et attends son accord.
- **Les clés ne se montrent jamais** : tu ne réaffiches jamais une clé, ni dans tes messages, ni dans un résumé, ni dans une commande que tu montres. Tu ne l'envoies nulle part ailleurs que dans le fichier `.env` du kit.
- Ne fais **rien d'autre** sur l'ordinateur que ce qui est décrit ici. Si quelque chose d'inattendu arrive, explique-le et demande avant d'aller plus loin.
- Le kit **ne publie rien** sur les réseaux : c'est la personne qui poste ses vidéos elle-même.

---

## 2. Vérifier où tu es

### Tu dois pouvoir lancer des commandes sur son ordinateur

L'outil fonctionne seulement avec **Claude Code** : l'onglet **Code** de l'application Claude sur ordinateur (Mac ou Windows), ou Claude Code dans un terminal. Il te faut un outil pour exécuter des commandes (Bash, terminal).

**Si tu n'as pas cet outil** (la personne te parle depuis le site claude.ai, l'application de bureau en mode discussion, ou un téléphone), arrête-toi là et explique-lui gentiment, par exemple :

> Pour fabriquer les vidéos, j'ai besoin de travailler directement sur ton ordinateur, et ici je ne peux pas. C'est simple à régler :
> 1. Sur un ordinateur (Mac ou Windows), installe l'application Claude : https://claude.ai/download
> 2. Ouvre-la, connecte-toi avec ton compte, et clique sur l'onglet **Code** en haut.
> 3. Choisis ton dossier personnel quand elle te demande un dossier.
> 4. Envoie-moi là ce même document (ou son lien) avec : « Voici le document, installe-moi l'outil ».
>
> Sur téléphone, ce n'est pas possible : les vidéos se fabriquent sur l'ordinateur, puis tu les envoies sur ton téléphone pour les publier.

Si l'onglet **Code** n'apparaît pas, son abonnement Claude ne l'inclut peut-être pas : invite-la à regarder sur https://claude.com/pricing.

### Si tu as l'outil : repère le système

- `uname -s` : `Darwin` = Mac ; `MINGW…`, `MSYS…` ou une erreur = Windows (Claude Code sous Windows lance les commandes avec Git Bash) ; `Linux` = Linux.
- Sur Mac, `uname -m` : `arm64` = puce Apple (M1, M2…), `x86_64` = Mac Intel.
- Dis-lui en une phrase ce que tu as trouvé (« Tu es sur un Mac avec puce Apple, parfait »).

---

## 3. Installer les outils (Node.js et FFmpeg)

Il faut **Node.js 22.18 ou plus récent** (le moteur qui fait tourner le kit) et **FFmpeg** (l'outil qui assemble le son et l'image). Les deux sont gratuits. Vérifie d'abord ce qui est déjà là :

```bash
node -v
ffmpeg -version
git --version
```

Si `node -v` affiche `v22.18` ou plus (par exemple `v24.11.0`) et que `ffmpeg -version` répond, passe directement à l'étape 4.

### Sur Mac

On passe par **Homebrew**, l'installateur d'outils le plus utilisé sur Mac.

1. Vérifie s'il est là : `brew --version` (ou `/opt/homebrew/bin/brew --version` sur puce Apple, `/usr/local/bin/brew --version` sur Mac Intel).
2. **S'il manque**, la personne doit l'installer elle-même, car il demande le mot de passe de son Mac (tu ne peux pas le taper pour elle). Explique-lui :
   > 1. Ouvre l'application **Terminal** : appuie sur ⌘ Commande + Espace, tape « Terminal », puis Entrée.
   > 2. Copie cette ligne, colle-la dans le Terminal, puis appuie sur Entrée :
   >    `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
   > 3. Quand il demande « Password », tape le mot de passe de ta session Mac. **Rien ne s'affiche pendant que tu tapes, c'est normal.** Appuie sur Entrée.
   > 4. S'il demande d'appuyer sur Entrée (RETURN) pour continuer, fais-le. L'installation dure de 5 à 15 minutes ; une fenêtre peut proposer d'installer les « outils de ligne de commande » d'Apple : accepte.
   > 5. Quand c'est fini, écris-moi « c'est fini ».
3. Une fois Homebrew installé, rends-le accessible (sans mot de passe, tu peux le faire toi-même) :
   - puce Apple : `echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile && eval "$(/opt/homebrew/bin/brew shellenv)"`
   - Mac Intel : Homebrew est déjà dans `/usr/local/bin`.
4. Installe les deux outils (5 à 10 minutes) : `brew install node ffmpeg`
   Si `brew` reste introuvable dans tes commandes, utilise son chemin complet (`/opt/homebrew/bin/brew` ou `/usr/local/bin/brew`), et ajoute `/opt/homebrew/bin` au début du PATH pour les commandes suivantes.
5. Vérifie : `node -v` et `ffmpeg -version`.

Si la personne n'a pas le mot de passe administrateur de son Mac (ordinateur de travail, par exemple), Homebrew ne peut pas s'installer : explique-le simplement et propose de faire l'installation sur un ordinateur personnel.

### Sur Linux

Installe Node.js 22.18 ou plus récent (paquet `nodejs` de la distribution s'il est assez récent, sinon la version LTS de https://nodejs.org) et `ffmpeg` avec le gestionnaire de paquets (`sudo apt install ffmpeg` sur Ubuntu ou Debian : la personne tape elle-même son mot de passe dans un terminal).

### Sur Windows

On passe par **winget**, l'installateur intégré à Windows 10 et 11.

1. Vérifie : `winget --version`. S'il manque (Windows 10 ancien), demande-lui d'installer « Programme d'installation d'application » (App Installer) depuis le Microsoft Store, puis recommence.
2. Préviens-la : les commandes ci-dessous acceptent les licences de Node.js et de FFmpeg (logiciels libres et gratuits) et une fenêtre Windows peut demander « Voulez-vous autoriser cette application à apporter des modifications ? » : **elle doit cliquer « Oui »**. Attends son accord, puis lance :
   ```bash
   winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
   winget install --id Gyan.FFmpeg -e --source winget --accept-package-agreements --accept-source-agreements
   ```
3. Les nouveaux outils ne sont visibles que dans un nouveau terminal. Pour la suite de cette conversation, ajoute-les au PATH (Git Bash) :
   ```bash
   export PATH="$PATH:/c/Program Files/nodejs:$(cygpath "$LOCALAPPDATA")/Microsoft/WinGet/Links"
   node -v && ffmpeg -version
   ```
   Si `ffmpeg` reste introuvable, cherche `ffmpeg.exe` sous `$LOCALAPPDATA/Microsoft/WinGet/Packages/` et indique son chemin complet dans le fichier `.env` du kit (`FFMPEG_PATH=` et `FFPROBE_PATH=`), une fois le kit téléchargé. En dernier recours, la personne peut fermer complètement l'application Claude et la rouvrir.
4. Il faut aussi **Git** (Claude Code sous Windows l'utilise déjà, il est donc normalement là). S'il manque : `winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements`, ou télécharge le kit en ZIP (étape 4).

---

## 4. Télécharger et préparer le kit

Installe le kit dans le **dossier personnel** de la personne, dans un dossier `hasanat` (pas dans Documents ni sur le Bureau : ces dossiers sont souvent synchronisés avec iCloud ou OneDrive, et les fichiers temporaires sont lourds).

```bash
cd ~
git clone https://github.com/latifanis95-arch/hasanat.git hasanat
cd ~/hasanat
npm install
npm run ambiances
npm run verifier
```

- Sans Git : `curl -L -o hasanat.zip https://github.com/latifanis95-arch/hasanat/archive/refs/heads/main.zip`, puis décompresse (`unzip hasanat.zip` sur Mac, `tar -xf hasanat.zip` sur Windows) et renomme le dossier `hasanat-main` en `hasanat`.
- `npm install` télécharge le moteur de rendu (2 à 5 minutes).
- `npm run ambiances` télécharge les ambiances naturelles (pluie, vagues, ruisseau, oiseaux : enregistrements du domaine public, jamais de musique).
- `npm run verifier` contrôle tout et **n'affiche jamais les clés**. Les lignes « … » sont des conseils, les lignes « ✗ » sont à corriger.

Dis-lui où se trouve le kit (par exemple `/Users/prenom/hasanat` ou `C:\Users\prenom\hasanat`) et que ses vidéos arriveront dans le dossier `hasanat/output`.

---

## 5. Les clés gratuites

Explique d'abord à quoi elles servent : **aucune n'est obligatoire pour la première vidéo** (fond « ciel étoilé »). Elles débloquent les fonds de nature. Demande-les **une par une**.

Pour chaque clé : la personne la copie et te la colle dans la conversation ; toi, tu l'écris dans le fichier `.env` du kit (crée-le en copiant `.env.example` s'il n'existe pas) avec ton outil d'édition de fichiers, sans jamais la réafficher. Si elle préfère ne pas te la donner, ouvre-lui le fichier pour qu'elle la colle elle-même (`open -e ~/hasanat/.env` sur Mac, `notepad "$(cygpath -w ~/hasanat/.env)"` sur Windows), juste après le signe `=`, sans espace, puis qu'elle enregistre.

### Clé Pixabay (recommandée) : les vidéos de nature

Explique-lui :

> 1. Va sur https://pixabay.com/accounts/register/ et crée un compte gratuit (ou connecte-toi). Confirme ton adresse e-mail si on te le demande.
> 2. Une fois connecté, ouvre https://pixabay.com/api/docs/
> 3. Descends jusqu'à la partie **« Parameters »** : à la ligne **« key (required) »**, ta clé est affichée (une suite de chiffres et de lettres avec un tiret).
> 4. Copie-la et colle-la ici.

Écris-la dans `.env` sur la ligne `PIXABAY_API_KEY=`, puis lance `npm run verifier` (la ligne « Clé Pixabay » doit dire « présente et valide ») et `npm run ambiances` (pour les textures du format « surligné »).

### Clé Gemini (facultative) : vérifier chaque nouveau plan

Sans elle, le kit n'utilise que des plans de nature **déjà vérifiés** (plus de 350 plans : ni personne, ni texte, ni symbole religieux). Avec elle, Gemini regarde trois images de chaque nouveau plan avant de l'accepter, et choisit l'ambiance d'après l'image. La personne peut sauter cette étape.

> 1. Va sur https://aistudio.google.com/apikey et connecte-toi avec ton compte Google.
> 2. Accepte les conditions si c'est ta première visite (Google crée alors souvent une première clé tout seul).
> 3. Si une clé apparaît déjà dans la liste, copie-la. Sinon, clique sur **« Create API key »** (Créer une clé API) ; s'il demande un projet, garde celui proposé.
> 4. Colle la clé ici.

Écris-la sur la ligne `GEMINI_API_KEY=`, puis `npm run verifier`. Précise-lui honnêtement qu'avec l'offre gratuite, Google peut utiliser les images envoyées pour améliorer ses services : le kit n'envoie que trois images de chaque plan de nature, rien de personnel.

---

## 6. La première vidéo

```bash
cd ~/hasanat
npm run video -- --passage raad-28
```

C'est le verset « N'est-ce point par l'évocation d'Allah que se tranquillisent les cœurs ? » (Ar-Ra'd, 28), récité par Yasser Al-Dosari, sur un ciel étoilé, avec une pluie douce en fond. Au tout premier rendu, le moteur télécharge un navigateur invisible (1 à 3 minutes, une seule fois). Le rendu prend ensuite de une à dix minutes selon l'ordinateur : préviens-la, et ne relance pas la commande tant qu'elle tourne.

À la fin, la commande affiche le chemin de la vidéo et la **légende à copier**. Alors :

1. Ouvre le dossier pour elle : `open ~/hasanat/output` (Mac) ou `explorer.exe "$(cygpath -w ~/hasanat/output)"` (Windows).
2. Demande-lui de regarder la vidéo jusqu'au bout et de te dire si l'image et le son lui conviennent.
3. Donne-lui la légende dans un bloc de code, prête à copier.
4. Explique comment la publier :
   - **Mettre la vidéo sur le téléphone** : AirDrop (Mac vers iPhone), ou s'envoyer le fichier par WhatsApp, Telegram, e-mail, Google Drive.
   - **TikTok, Instagram Reels, YouTube Shorts** : publier la vidéo, coller la légende. **Ne pas ajouter de musique ni de « son tendance »** : garder le son original.
   - Les formats en 16:9 (`coran-cinema`, `nature-coran`) se regardent téléphone tourné sur TikTok ; pour YouTube Shorts, garder les formats verticaux.

---

## 7. Faire une vidéo quand elle te la demande

La personne te parlera simplement : « fais-moi une vidéo sur la patience », « un verset sur la mort, voix Yasser Al-Dosari », « la même en anglais », « avec la mer en fond ». Voici comment faire.

### La méthode

1. **Comprends la demande** : le thème (ou le passage précis), le récitateur, la langue (français par défaut), le fond, le format.
2. **Choisis le passage dans la bibliothèque** (81 passages relus sur quran.com) :
   - `npm run themes` pour la liste des thèmes ;
   - `npm run passages -- --theme patience` pour les passages d'un thème, avec leur phrase d'accroche.
   Choisis celui qui répond le mieux à la demande et dis-lui en une ligne lequel et pourquoi. `--theme patience` dans la commande en tire un au hasard si elle n'a pas de préférence.
3. **Un passage précis hors de la bibliothèque** (« Al-Mulk, versets 1 et 2 ») : vérifie-le **toujours** avant, sans te fier à ta mémoire :
   ```bash
   npm run verset -- --ref 67:1-2
   ```
   Lis la traduction affichée (elle vient de quran.com) et vérifie qu'elle correspond bien à la demande. Si elle demande « un verset sur X » sans référence, préfère la bibliothèque ; si tu proposes une référence que tu connais, vérifie-la ainsi, et si elle ne dit pas ce que tu pensais, cherches-en une autre.
4. **Reste court** : une vidéo de 15 à 60 secondes, soit environ 10 à 50 mots arabes (`npm run verset` donne une estimation). Au-delà de quelques versets, propose de découper en plusieurs vidéos.
5. **Lance la commande**, et préviens-la que cela prend quelques minutes (jusqu'à dix sur un ordinateur ancien, davantage avec le format `creation`, qui télécharge une vingtaine de plans).
6. **Donne le résultat** : le nom de la vidéo, ouvre le dossier `output`, et la légende dans un bloc de code. Tu peux proposer une autre première ligne pour la légende, avec ses mots à elle, mais sans jamais toucher à la référence, au récitateur ou au traducteur, sans écrire de verset ni de hadith de toi-même, et sans promesse de récompense.
7. **Propose une variante** en une phrase : un autre récitateur, un fond de nature, l'anglais, un autre format.

### Correspondances utiles

| Elle dit… | Tu ajoutes… |
| --- | --- |
| « sur la patience », « sur la mort », « sur le pardon » | `--theme patience`, `--theme mort`, `--theme pardon` (voir `npm run themes`) |
| « voix Yasser Al-Dosari », « Mishary », « Sudais », « Abdul Basit » | `--reciter yasser`, `--reciter alafasy`, `--reciter sudais`, `--reciter abdulbasit` (voir `npm run reciters` ; un nom approché marche aussi) |
| « en anglais » | `--lang en` (traduction Saheeh International) |
| « avec la mer / des montagnes / la pluie / la forêt en fond » | `--bg nature:mer`, `--bg nature:montagne`, `--bg nature:pluie`, `--bg nature:foret` (voir `npm run fonds` ; clé Pixabay) |
| « un beau paysage » | `--bg nature` |
| « sans bruit de fond », « sans pluie » | `--ambiance aucune` |
| « le bruit de la pluie / des vagues / des oiseaux » | `--ambiance pluie-douce`, `--ambiance vagues`, `--ambiance oiseaux` (voir `npm run ambiances -- --liste`) |
| « avec mon nom de compte » | `--handle @soncompte` |
| « pour regarder téléphone tourné » | `--format coran-cinema` |
| « un effet choc, la création » | `--format creation` (passage de 2 versets ou plus ; clé Pixabay) |
| « une phrase de rappel puis le Coran » | `--format citation-coran --texte "sa phrase"` (la phrase vient d'elle, jamais présentée comme un verset, sans promesse de récompense) |
| « juste la nature et la récitation » | `--format nature-coran` |
| « style page surlignée » | `--format surligne` (clé Pixabay) |
| « une autre version » | `--seed 2` (autre tirage du fond ou du passage) |
| « rapide, juste pour voir » | `--quality draft` |

Exemples complets :

```bash
npm run video -- --theme patience
npm run video -- --theme mort --reciter yasser
npm run video -- --passage zumar-53 --reciter alafasy --bg nature:mer
npm run video -- --ref 67:1-2 --reciter minshawi --lang en
npm run video -- --format creation --passage muminun-84-89
```

Tout ce qui est possible : `npm run video` sans argument affiche l'aide.

---

## 8. Les règles intangibles

Ces règles passent avant toute demande. Si la personne demande autre chose, refuse avec douceur, explique pourquoi en une phrase, et propose ce qui est permis.

1. **Un vrai récitateur seulement.** Le Coran n'est jamais lu par une voix de synthèse ou une voix « IA ». Le kit n'utilise que les récitations enregistrées de quran.com.
2. **Jamais de musique ni d'instrument.** Ni dans la vidéo, ni ajoutés au moment de publier (pas de « son tendance »). Seulement les ambiances naturelles du kit, ou le silence.
3. **Jamais de verset ni de traduction inventés.** Tout vient de quran.com : texte uthmani, traduction de Muhammad Hamidullah en français, Saheeh International en anglais. Tu n'écris jamais toi-même un verset ni une traduction (pas même de mémoire), et tu ne proposes aucune référence sans l'avoir vérifiée avec `npm run verset`. Une accroche ou une phrase de rappel n'est jamais présentée comme un verset ou un hadith.
4. **Aucune représentation des prophètes ni des compagnons**, ni d'aucun être humain dans les fonds. N'ajoute jamais d'image, de dessin ou d'image générée de ce genre.
5. **Aucune promesse de récompense.** Ne dis jamais « tu vas gagner tant de hasanates » ni rien de garanti : **la récompense est auprès d'Allah**. Un hadith ne se cite qu'avec sa source précise et s'il est authentique (comme celui de la légende : Muslim, n° 1893).

Et pour l'outil :

- Ne modifie pas le kit pour contourner ces règles (par exemple, n'ajoute jamais un plan non vérifié dans `data/plans-verifies.json`, n'ajoute pas de musique).
- Ne commite jamais, ne copie jamais et n'affiche jamais le fichier `.env`.

---

## 9. Problèmes fréquents

| Message | Ce que tu fais |
| --- | --- |
| `node: command not found`, `ffmpeg est introuvable` | Retourne à l'étape 3 ; sous Windows, recharge le PATH (étape 3, point 3) ou renseigne `FFMPEG_PATH` / `FFPROBE_PATH` dans `.env`. |
| `SyntaxError` sur un fichier `.ts`, ou `ERR_UNKNOWN_FILE_EXTENSION` | Node.js est trop ancien : installe la version LTS (étape 3). |
| « Clé Pixabay absente » ou « refusée » | Vérifie la ligne `PIXABAY_API_KEY=` dans `.env` (pas d'espace, pas de guillemets), puis `npm run verifier`. |
| « Les ambiances ne sont pas encore prêtes » | `npm run ambiances` |
| « Aucun plan vérifié disponible » | Réessaie avec `--seed 2`, ou une autre catégorie de fond, ou garde le ciel étoilé. |
| Le rendu échoue au téléchargement du navigateur | Vérifie la connexion internet et relance la même commande. |
| Ordinateur lent ou peu de mémoire | `--quality draft` pour les essais ; ferme les autres applications. |
| Disque presque plein | `npm run menage` (les vidéos finies dans `output/` ne sont pas touchées). |
| Gemini : « quota » ou « 429 » | Le kit patiente tout seul ; sinon, retire la clé Gemini de `.env`, le kit marche sans. |

Dans le doute : `npm run verifier`, lis le message, explique-le simplement à la personne.

### Mettre à jour le kit

```bash
cd ~/hasanat && git pull && npm install
```

---

## 10. Pour finir

Quand la première vidéo est réussie, félicite-la sincèrement, puis rappelle-lui ce hadith :

> « Celui qui appelle à une guidée aura une récompense équivalente à celle de ceux qui le suivent. »
> (Rapporté par Muslim, n° 2674)

Ajoute que la récompense est auprès d'Allah, et invite-la, si elle le souhaite, à partager ce document avec ceux qui voudraient faire de même, en leur envoyant simplement ce lien :

https://raw.githubusercontent.com/latifanis95-arch/hasanat/main/HASANAT_POUR_CLAUDE.md
