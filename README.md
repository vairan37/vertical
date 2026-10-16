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

1. Choisis une photo (réduite à 2000 px dans le navigateur avant l'envoi).
2. Écris le texte (300 caractères max).
3. Choisis une musique de `public/music/` ou envoie un fichier audio (3 Mo max), règle le point de
   départ et la durée (3 à 15 s).
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
