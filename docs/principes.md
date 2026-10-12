# Principes (non négociables)

Le but est de faire entendre et comprendre la Parole d'Allah. Une erreur dans un verset ou un hadith inventé annulerait tout le bien recherché : ces règles passent avant la vitesse de production.

## Le texte sacré

- **Texte coranique** : uniquement le texte uthmani de [quran.com](https://quran.com), récupéré par son API au moment de faire la vidéo. Jamais retapé à la main, jamais généré ou « corrigé » par une IA, jamais tronqué au milieu d'un mot.
- **Traductions** : uniquement des traductions publiées, prises sur quran.com : Muhammad Hamidullah en français, Saheeh International en anglais. Une traduction rend le sens, ce n'est pas le Coran : le nom du traducteur figure toujours dans la légende.
- **Référence** : sourate et numéro de verset visibles à l'écran ou dans la légende, pour que chacun puisse vérifier.
- **Avant une vidéo sur un passage hors de la bibliothèque** : `npm run verset -- --ref 67:1-2` affiche le texte arabe et la traduction de quran.com, pour vérifier que le passage dit bien ce qu'on croit.

## La récitation

- Seulement de vrais récitateurs reconnus, enregistrés (récitations de quran.com), découpées **uniquement aux frontières de versets**.
- Jamais de voix de synthèse ni de voix « IA » pour le Coran.
- Pas de musique, pas d'instrument, pas de changement de hauteur ou de vitesse, pas d'effet qui déforme la voix.
- Ambiances : uniquement des sons naturels (pluie, vagues, ruisseau, oiseaux), toujours nettement sous la récitation.
- En publiant : ne pas ajouter de musique ou de « son tendance » de l'application par-dessus.

## Hadiths et rappels

- Un hadith n'apparaît qu'avec sa source précise (recueil + numéro) et s'il est authentique (sahih ou hasan). Vérification sur [dorar.net](https://dorar.net) ou [sunnah.com](https://sunnah.com).
- Le carton de fin et la légende citent : « Celui qui indique un bien a la même récompense que celui qui le fait » (Muslim, n° 1893).
- Aucune promesse de récompense de notre part (« tu gagneras tant de hasanates ») : la récompense est auprès d'Allah.

## L'IA

- Autorisée pour : regarder les images des fonds (Gemini, facultatif), aider à choisir un passage dans la bibliothèque, écrire une accroche ou une légende.
- Interdite pour : le texte coranique, les traductions, les hadiths, la voix du récitateur.
- Une accroche n'est jamais présentée comme un verset ou un hadith.

## Images et droits

- Fonds : ciel étoilé dessiné par le moteur, vidéos de nature libres de droits (Pixabay) ou tes propres vidéos.
- Chaque plan Pixabay est vérifié : ni personne, ni texte, ni construction pour la nature. Sans clé Gemini, seuls des plans déjà vérifiés (`data/plans-verifies.json`) sont utilisés.
- Aucune représentation des prophètes ni des compagnons, ni d'aucun être humain dans les fonds ; rien d'inapproprié à côté du Coran.
- Les fichiers de Pixabay et de Wikimedia Commons sont téléchargés chez chacun, jamais redistribués dans ce dépôt.
- Polices sous licence libre (SIL Open Font License), fournies dans `assets/fonts` avec leur licence.

## Plateformes

- TikTok et Instagram pénalisent les contenus dupliqués et les comptes qui ressemblent à du spam : varie les passages, les récitateurs, les fonds et les formats, et garde un rythme de publication humain.
