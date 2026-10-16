# vertical

Site personnel (PWA) pour créer des vidéos verticales (9:16) à partir d'une template fixe
— une image, un texte, une musique — puis les publier sur Instagram (Reels) et TikTok et suivre
leurs vues.

## Démarrage

Prérequis : Node.js 20.9 ou plus récent.

```bash
npm install
cp .env.example .env.local   # puis renseigner les valeurs
npm run dev                  # http://localhost:3000
```

Vérifications :

```bash
npm run lint
npm run build
```

## Base de données et stockage

- Base Postgres (Neon) via Drizzle ORM. Les migrations (`drizzle/`) sont appliquées automatiquement
  à chaque `npm run build`, donc à chaque déploiement Vercel.
- Vidéos et images sources dans Vercel Blob (store **public**).

Configuration sur Vercel (une seule fois) :

1. Projet Vercel → onglet **Storage** → **Create Database** → **Neon** → relie-le au projet
   (Production et Preview). `DATABASE_URL` est ajoutée automatiquement.
2. Onglet **Storage** → **Create** → **Blob** → accès **Public** → relie-le au projet.
   `BLOB_READ_WRITE_TOKEN` (ou `BLOB_STORE_ID`) est ajoutée automatiquement.
3. Redéploie, puis ouvre `/api/render` : tu dois voir `"base":"configurée"` et
   `"stockage":"Vercel Blob"`.

En local : copie `.env.example` en `.env.local` et renseigne `DATABASE_URL` (Neon ou Postgres local).
Sans token Blob, les fichiers vont dans `.data/files`.

## Utilisation

En haut de « Créer », l'**aperçu exact** (calculé par le même moteur que la vidéo finale) suit
tes réglages : photo, texte, template. « ▶ Lire l'aperçu » joue l'extrait de musique choisi
avec les fondus ; avec un clip ou un GIF, l'aperçu bouge aussi (composé dans le navigateur
avec le même cadrage que le serveur et le calque texte rendu par le serveur).

1. Choisis une **photo** (réduite à 2000 px dans le navigateur avant l'envoi) **ou une vidéo**
   (MP4, MOV, WebM, ou GIF animé ; 200 Mo max). La vidéo est envoyée directement dans le stockage pendant que
   tu règles le reste ; elle est cadrée comme une photo (template), rejouée en boucle si elle est
   plus courte que la vidéo, et son propre son est remplacé par la musique choisie. Avec un clip,
   la création prend à peu près la durée de la vidéo.
2. Écris le texte (300 caractères max) et, si tu veux, l'**auteur** (ex. le rappeur) : il
   s'affiche « - Nom » juste sous le texte, calé à droite, dans la police de la template.
3. Musique **facultative** : par défaut « Aucune », la vidéo est muette (piste audio silencieuse)
   et tu règles sa durée. Sinon choisis une musique de `public/music/`, un son YouTube, ou envoie
   un fichier audio (3 Mo max), puis l'**extrait** (début + durée de 15 à 90 s) : la musique
   commence avec la vidéo et **la vidéo dure exactement l'extrait** (raccourcie si le son se
   termine avant). « Modifier l'extrait » change le début ou la durée à tout moment, « Changer de
   son » repart du choix de la musique. 90 s est la limite des Reels publiés par l'API Instagram.
4. « Créer la vidéo » : le serveur génère un MP4 1080x1920 (H.264 + AAC, 30 fps), l'enregistre et
   l'ajoute à « Mes vidéos ».
5. « Mes vidéos » : grille des couvertures avec leur nom (comme un profil TikTok) et l'état
   Instagram (IG) / TikTok (TT) de chacune. Touche une vidéo pour la lire, la renommer, la
   télécharger, la supprimer, ou indiquer à la main où elle est publiée (« Marquer publiée »).
   ⚠ signale une vidéo publiée sur un seul réseau. Supprimer une vidéo l'efface du site et du
   stockage, jamais d'Instagram ni de TikTok.

6. « Publiées » : uniquement les vidéos en ligne sur au moins un réseau, et en haut le bloc
   « Comptes » pour connecter ou déconnecter Instagram et TikTok (la connexion arrive avec la
   publication automatique).

Pour ajouter des musiques : dépose des fichiers `.mp3` dans `public/music/` et redéploie.

## Sons YouTube

Dans « Créer », **Chercher un son sur YouTube** : tape un titre, choisis un résultat, indique le
début de l'extrait (minutes et secondes), sa durée (15 s par défaut, jusqu'à 90 s), puis
« Utiliser ». Le serveur récupère l'extrait en MP3 et la durée de la vidéo s'aligne dessus. Il
utilise [yt-dlp](https://github.com/yt-dlp/yt-dlp), téléchargé au build à une version figée et
vérifiée (`scripts/fetch-yt-dlp.mjs`).

La recherche marche sans configuration. **Le téléchargement exige des cookies YouTube** : YouTube
bloque les serveurs (« Sign in to confirm you're not a bot »).

1. Utilise un **compte Google secondaire** : YouTube peut restreindre un compte utilisé ainsi.
2. Dans une **fenêtre de navigation privée**, connecte-toi à youtube.com avec ce compte.
3. Exporte les cookies au format `cookies.txt` (Netscape) avec une extension comme
   « Get cookies.txt LOCALLY », puis **ferme la fenêtre privée sans te déconnecter** (sinon
   YouTube invalide les cookies). Voir la
   [FAQ yt-dlp](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies).
4. Vercel → Settings → Environment Variables → `YOUTUBE_COOKIES` = contenu du fichier (ou le
   fichier en base64). Redéploie.
5. Vérifie sur `/api/render` : `"youtube": "yt-dlp OK, cookies configurés"`.

Les cookies expirent : si le message « les cookies YouTube ont sans doute expiré » apparaît,
recommence les étapes 2 à 4. Pour mettre yt-dlp à jour (si YouTube casse le téléchargement),
change `VERSION` et `SHA256` dans `scripts/fetch-yt-dlp.mjs`.

Les plateformes peuvent rendre muette ou bloquer une vidéo contenant un son protégé.

## Templates

L'onglet « Templates » permet de créer, modifier, dupliquer et supprimer des templates, et de
choisir celle présélectionnée à la création (« Par défaut »). Réglages : position et taille du
texte, police, couleur du texte, cadrage de l'image (remplir l'écran, pleine largeur ou pleine
hauteur ; les deux derniers créent des bandes selon le format de la photo), taille et position de
l'image, couleur du fond (bandes), assombrissement.
L'aperçu se met à jour en direct. Supprimer une template ne supprime pas les vidéos déjà créées.

Pour ajouter une police : dépose un fichier `.ttf` **statique** (pas de police variable) dans
`assets/fonts/` et ajoute-la dans `FONTS` (`lib/template-settings.ts`).

## Avancement

Voir [CLAUDE.md](./CLAUDE.md) pour la stack, la structure du code et le plan de travail.
