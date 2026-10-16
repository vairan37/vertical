@AGENTS.md

# vertical

Site perso (PWA, surtout utilisé sur téléphone) pour créer une vidéo verticale 9:16 à partir d'une
template (image + texte + musique ; templates éditables dans l'onglet « Templates »), la publier en un clic sur Instagram
(Reels) et TikTok, et suivre les vues. Un seul utilisateur : Victor. Interface en français, échanges
en français (tutoiement).

**Priorité absolue : simplifier la création et la publication. À chaque choix, l'option la plus
simple qui fonctionne.**

## Stack

- Next.js 16 (App Router, TypeScript strict, Tailwind v4, Turbopack, `cacheComponents` activé)
- Hébergement Vercel, base Postgres (Neon) + Drizzle ORM (étape 1), stockage Vercel Blob (étape 1)
- Rendu vidéo côté serveur : frame via `ImageResponse` (`next/og`), puis `ffmpeg-static`
  assemble image + musique en MP4 (H.264 + AAC, 1080x1920, 30 fps, 3 à 90 s). L'image étant fixe,
  lib/video.ts encode 3 segments courts (fondu d'entrée, image fixe, fondu de sortie) et les
  enchaîne par copie (concat) : 90 s de vidéo en ~6 s au lieu de ~70 s sur 1 cœur.

## Commandes

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # doit passer à chaque étape
npm run lint    # doit passer à chaque étape
npm run db:generate  # après une modif de lib/db/schema.ts : génère la migration SQL dans drizzle/
npm run db:migrate   # applique les migrations (aussi lancé automatiquement par npm run build)
```

Base locale pour tester : Postgres 16 (`DATABASE_URL` dans `.env.local`). Sans `BLOB_READ_WRITE_TOKEN`,
les fichiers sont enregistrés dans `.data/files` et servis par `/api/files/[name]` (dev uniquement).
`GET /api/render` affiche un diagnostic (ffmpeg, musiques, base, stockage).

## Structure

```
app/
  layout.tsx          layout racine (lang="fr", thème sombre, navigation)
  nav.tsx             barre de navigation (Créer / Mes vidéos / Templates)
  page.tsx            page d'accueil -> outil de création
  creator.tsx         composant client de création (image, texte, musique, durée, aperçu)
  videos/             "Mes vidéos" : grille de couvertures façon profil TikTok ; [id] = détail
                      (lecture, renommer, télécharger, supprimer, statut + marquage manuel)
  api/music/route.ts  GET : liste des musiques de public/music
  api/render/route.tsx POST multipart : génère le MP4, l'enregistre (stockage + base), renvoie l'URL
  publiees/           "Publiées" : bloc Comptes (connexion Instagram/TikTok, état, déconnexion) +
                      grille des vidéos publiées sur au moins un réseau
  templates/          CRUD des templates : liste (créer, dupliquer, par défaut) et éditeur [id]
  api/templates/preview/ GET : aperçu PNG d'une template (réglages en JSON dans ?s=)
  api/preview/        POST : aperçu exact de la page de création (même renderFrame, JPEG 540x960)
  api/uploads/        envoi direct d'un clip vidéo vers Blob (URL présignée, OIDC) ; multipart en local
  api/files/[name]/   sert le stockage local (dev sans Vercel Blob)
  api/youtube/        search (GET ?q=) et audio (POST {id,start,length} -> MP3)
  youtube-picker.tsx  recherche YouTube dans la section Musique du formulaire
lib/
  template.tsx        rendu de la frame (ImageResponse) à partir des réglages d'une template
  template-settings.ts réglages d'une template (positions, tailles, police, couleurs), polices,
                      valeurs par défaut et validation (parseSettings) ; partagé client/serveur
  templates.ts        lecture des templates, choix de celle à utiliser pour un rendu
  image-size.ts       dimensions d'un JPEG/PNG (cadrages pleine largeur / pleine hauteur)
  source-image.ts     validation de la photo envoyée (partagée par render et preview)
  youtube.ts          recherche YouTube + extrait audio (15 à 90 s) via yt-dlp (cookies YOUTUBE_COOKIES)
  music.ts            liste/résolution des musiques (protection path traversal)
  video.ts            appel ffmpeg : renderVideo (photo, segments par copie) et renderClip (clip
                      vidéo : fond + clip cadré + calque texte transparent, encodé ~temps réel)
  db/schema.ts        tables Drizzle : templates, videos, publications, stats, social_accounts
  db/index.ts         connexion Postgres (driver pg, compatible Neon)
  storage.ts          Vercel Blob (ou disque local en dev)
  videos.ts           lecture des vidéos avec leurs publications
drizzle/              migrations SQL générées (ne pas modifier à la main)
scripts/migrate.mjs   applique les migrations (ignoré si DATABASE_URL absente)
scripts/fetch-yt-dlp.mjs télécharge bin/yt-dlp au build (version figée + SHA-256 vérifié ; bin/ ignoré par git)
assets/fonts/         polices TTF statiques (OFL / Apache) ; ajouter une police = fichier ici +
                      entrée dans FONTS (lib/template-settings.ts). Pas de police variable (Satori).
next.config.ts        serverExternalPackages + outputFileTracingIncludes (ffmpeg, musiques, police)
public/music/         musiques .mp3 incorporées dans les vidéos
```

## Règles

- Cette version de Next.js diffère de ce que tu connais : lire AGENTS.md et
  `node_modules/next/dist/docs/` avant d'écrire du code. Respecter les dépréciations
  (`proxy` au lieu de `middleware`, APIs de requête asynchrones, pas de runtime edge, pas de
  `dynamic`/`revalidate` avec `cacheComponents`).
- Les routes qui contiennent du JSX sont en `.tsx`.
- Pas de dépendance inutile, pas de sur-ingénierie (un utilisateur, faible volume).
- TypeScript strict ; `npm run build` et `npm run lint` verts à chaque étape.
- Aucun secret dans le dépôt ; `.env.example` documenté. Tokens des réseaux sociaux chiffrés en base.
- Tout appel externe (Instagram, TikTok) passe par l'interface `SocialProvider`, avec une vraie
  implémentation et une implémentation simulation (`DRY_RUN=true`) : aucun appel réseau, journalise
  ce qui serait envoyé, renvoie de faux identifiants.
- Messages d'erreur clairs et en français dans l'interface. Échecs de publication enregistrés en base
  avec la raison, et relançables.
- Un commit par étape, préfixes `feat:`, `fix:`, `chore:`, `docs:`.
- Ne jamais publier sur de vrais comptes sans accord explicite de Victor. Aucune action destructive
  (suppression de données, force push) sans demander.
- Vérifier la doc officielle actuelle (Meta for Developers, developers.tiktok.com) avant chaque
  intégration. Si une contrainte d'API contredit le cahier des charges, le signaler avec la source.

## Contraintes des plateformes

- Instagram : compte Pro relié à une Page Facebook, Facebook Login. Reel = conteneur
  (`media_type=REELS`, `video_url` publique) -> polling jusqu'à `FINISHED` -> `media_publish`.
  90 s max, H.264. En mode dev Meta, seuls les testeurs publient. Vues via insights du média.
- TikTok : Content Posting API (`video.upload`, `video.publish`). Sans audit, publication directe
  privée. Mode brouillon (`/v2/post/publish/inbox/video/init/`) par défaut. Vues via Display API
  (`video.list`). Pas de sons TikTok via l'API : musique incorporée dans la vidéo.

## Plan et avancement

- [x] Étape 0 : mise en route (projet "vertical", nettoyage, CLAUDE.md)
- [x] Outil de création (image + texte + musique -> MP4), testé de bout en bout en local.
      `public/music/demo-test.mp3` est un son de test à supprimer dès qu'il y a de vraies musiques.
- [x] Étape 1 : stockage (Vercel Blob) et base (Neon + Drizzle) : tables `videos`, `publications`,
      `stats`, `social_accounts` ; /api/render renvoie une URL ; page "Mes vidéos" avec statut par
      plateforme, alerte de désynchronisation et marquage manuel "publiée" (en attendant l'API).
      Neon + Blob configurés sur Vercel (Blob relié par OIDC : BLOB_STORE_ID).
- [x] « Mes vidéos » en CRUD : grille de couvertures (frame JPEG 540x960 générée au rendu, colonne
      cover_url), nom optionnel (colonne title), page détail : renommer, supprimer (base + fichiers
      Blob ; rien n'est supprimé sur les réseaux), statut par plateforme.
- [x] Templates : onglet « Templates » (CRUD), réglages simples (position/taille du texte et de
      l'image, cadrage remplir / pleine largeur / pleine hauteur, police, couleurs, assombrissement), aperçu en direct, template par défaut, choix de
      la template à la création. Remplace la « template fixe unique » du cahier des charges, à la
      demande de Victor. Template de départ « Classique » insérée par la migration 0002.
- [x] Page « Publiées » : grille des vidéos publiées + bloc Comptes lu dans social_accounts
      (jamais les tokens). « Connecter » explique ce qu'il faut préparer : l'OAuth réel arrive à
      l'étape 3 (routes à brancher sur ce bouton). « Déconnecter » supprime les tokens en base.
- [x] Sons YouTube (choix de Victor, risques acceptés : CGU YouTube, droits, compte secondaire) :
      recherche + extrait 15 s via yt-dlp. Téléchargement bloqué sur IP serveur sans cookies
      (YOUTUBE_COOKIES). Testé ici : recherche OK, téléchargement non testable sans cookies.
      Ne pas ajouter de contournement anti-bot (rotation de clients, etc.).
- [x] Illustration par photo OU clip vidéo : le clip part du navigateur directement vers Blob
      (uploadPresigned + handleUploadPresigned/issueSignedToken, compatible OIDC ; 200 Mo max),
      le rendu (/api/render, maxDuration 300 s) superpose fond, clip cadré (imageBox, sans coins
      arrondis), calque PNG transparent (renderFrame overlayOnly). Clip trop court = en boucle ;
      son du clip ignoré. Colonne source_video_url. GIF animé accepté comme clip. Aperçu d'un clip :
      composé côté client (fond + clip cadré via imageBox, partagé dans template-settings.ts + calque
      PNG transparent de /api/preview layer=overlay), le clip joue pendant « Lire l'aperçu ».
- [x] Musique facultative : par défaut aucune -> vidéo muette (piste silencieuse anullsrc).
- [ ] Étape 2 : authentification (mot de passe unique, cookie httpOnly, limite de tentatives ;
      routes cron protégées par secret)
- [ ] Étape 3 : publication (SocialProvider + simulation, écran de publication, Instagram, TikTok,
      page "Comptes", README de création des apps)
- [ ] Étape 4 : tableau de bord des vues (liste, totaux, courbes, Vercel Cron quotidien,
      bouton "Actualiser", import des anciennes vidéos)
- [ ] Étape 5 : PWA (manifest, icônes, standalone, thème sombre, ergonomie mobile)
- [ ] Étape 6 : finitions (erreurs, chargements, README final, checklist de mise en production)
