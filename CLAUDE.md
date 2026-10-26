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
  layout.tsx          layout racine (lang="fr", thème sombre, navigation, métadonnées PWA)
  manifest.ts         manifest PWA ; service-worker.tsx enregistre public/sw.js
  nav.tsx             barre d'onglets en bas (Créer / Vidéos / Publiées / Templates)
  ui.ts               styles partagés (règles de design, voir « Design »)
  image-library.tsx   bibliothèque d'images (panneau) ; image-actions.ts : retrait
  page.tsx            page d'accueil -> outil de création
  login/              page de connexion (mot de passe unique), actions signIn / signOut
  conditions/, confidentialite/  pages légales publiques (exigées par TikTok et Meta)
  creator.tsx         composant client de création (image, texte, auteur, musique, aperçu)
  pausing-video.tsx   <video> mis en pause quand la page est quittée (Activity) ou l'appli masquée
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
  api/images/         GET : bibliothèque d'images
  youtube-picker.tsx  recherche YouTube dans la section Musique du formulaire
  tiktok-fields.tsx   réglages d'une publication TikTok (conformes aux règles d'audit TikTok)
  api/publish/        POST : publie une vidéo sur un réseau (ou reprend le suivi)
  api/social/tiktok/creator/ GET : infos du compte TikTok pour l'écran de publication
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
  session.ts          cookie de session signé (sans base, utilisé par proxy.ts)
  auth.ts             requireAuth / denyUnauthenticated, connexion avec limite d'essais
  storage.ts          Vercel Blob (ou disque local en dev)
  videos.ts           lecture des vidéos avec leurs publications
  social/             SocialProvider : instagram.ts, tiktok.ts, simulation.ts (DRY_RUN) ; index.ts
  accounts.ts         comptes connectés : liste, enregistrement (chiffré), tokens renouvelés
  publish.ts          publishVideo : publication + suivi + enregistrement des statuts
  crypto.ts           chiffrement des tokens (AES-256-GCM)
  image-library.ts    bibliothèque (photos, clips, GIF) : liste, ajout sans doublon, lecture, retrait
  oauth.ts            adresse de retour OAuth, cookie state
  tiktok-options.ts   options TikTok (visibilité, interactions, déclaration) + validation, partagé
drizzle/              migrations SQL générées (ne pas modifier à la main)
scripts/migrate.mjs   applique les migrations (ignoré si DATABASE_URL absente)
scripts/fetch-yt-dlp.mjs télécharge bin/yt-dlp au build (version figée + SHA-256 vérifié ; bin/ ignoré par git)
assets/fonts/         polices TTF statiques (OFL / Apache) ; ajouter une police = fichier ici +
                      entrée dans FONTS (lib/template-settings.ts). Pas de police variable (Satori).
proxy.ts              protège tout le site (sauf /login, /conditions, /confidentialite) ; voir étape 2
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

## Design

Objectif : l'appli la plus simple possible au pouce, sans rien de parasite. Styles partagés dans
`app/ui.ts` (à utiliser plutôt que de nouvelles classes ad hoc).

- Une colonne (max-w-md), marges de 16 px, 24 px entre les blocs, 12 px dans un bloc.
- Une seule action principale par écran (`ui.primary`, bouton blanc plein) ; sur « Créer », elle
  est collée en bas, au-dessus de la barre d'onglets. Le reste en `ui.secondary` (gris) ; les
  actions rares ou destructives en texte discret (Déconnecter, Dupliquer, Supprimer la template).
- Navigation : barre d'onglets en bas (icône + libellé), zones de toucher ≥ 44 px.
- Blocs = `ui.card` avec un titre `ui.label` (petites capitales grises). Pas de cadres imbriqués.
- La couleur porte un sens et rien d'autre : vert réussi, rouge erreur, ambre attention, bleu
  lien / en cours. Pas de couleur de marque sur les boutons (YouTube, etc.).
- Divulgation progressive : options rares repliées (« Plus d'options », réglages TikTok ouverts
  au moment de publier). Pas de texte d'aide quand un libellé ou un placeholder suffit.
- Messages près de l'action concernée, en français, avec la solution.

## Contraintes des plateformes

- Instagram : « Instagram API with Instagram Login » (graph.instagram.com, v26.0), compte
  professionnel SANS Page Facebook (écart avec le cahier des charges, qui prévoyait Facebook Login +
  Page : plus simple, validé par la doc developers.facebook.com/docs/instagram-platform/content-publishing).
  Scopes instagram_business_basic + instagram_business_content_publish. Token long 60 jours,
  renouvelable après 24 h. Reel = conteneur (`media_type=REELS`, `video_url` publique, `cover_url`)
  -> polling `status_code` jusqu'à `FINISHED` -> `media_publish`. 100 publications / 24 h. Specs Reel :
  MP4 faststart, H.264, AAC ≤ 48 kHz, 3 s à 15 min. En mode dev Meta, seuls les testeurs.
- TikTok : Content Posting API, publication directe (`/v2/post/publish/video/init/`, scope
  `video.publish`) avec légende et options, repli sur le brouillon (`/inbox/video/init/`, scope
  `video.upload`) si TikTok répond `unaudited_client_can_only_post_to_private_accounts` (app non
  auditée + compte public). Non audité : tout est privé (doc direct-post). L'écran de publication
  suit les content-sharing-guidelines (vérifiées à l'audit, voir app/tiktok-fields.tsx et
  lib/tiktok-options.ts) : creator_info relu à chaque affichage et avant l'envoi, pseudo affiché,
  visibilité sans défaut, interactions décochées par défaut, déclaration commerciale, accord musique.
  Envoi en FILE_UPLOAD (PULL_FROM_URL exige un domaine vérifié :
  impossible avec Vercel Blob). Token 24 h + refresh 365 jours. 5 brouillons en attente / 24 h ;
  statut SEND_TO_USER_INBOX tant que Victor n'a pas publié depuis l'appli. Vues via Display API
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
- [x] Musique = extrait (début + durée, app/excerpt-fields.tsx) modifiable après coup ; la musique
      commence avec la vidéo et la durée de la vidéo = durée de l'extrait (plus de curseurs
      « départ » / « durée », sauf la durée d'une vidéo sans son). YouTube : extrait découpé côté
      serveur, rouvert dans YoutubePicker (initial) pour le modifier.
- [x] Ligne auteur (« - Nom ») sous le texte, calée à droite du bloc texte, même police (option
      author de renderFrame, colonne videos.author).
- [x] Navigation : Next 16 + cacheComponents cache la page quittée (React <Activity>) sans
      arrêter la lecture des <video>/<audio> : utiliser PausingVideo / un nettoyage
      useLayoutEffect qui met en pause.
- [x] Étape 2 : authentification. proxy.ts protège tout sauf /login (pages -> /login?next=,
      API -> 401). Cookie httpOnly signé HMAC (lib/session.ts, clé dérivée de APP_PASSWORD par
      scrypt, 60 jours). Sans APP_PASSWORD : ouvert en local, fermé sur Vercel. Les Server Actions
      appellent requireAuth() et les routes API denyUnauthenticated() (lib/auth.ts) : à faire pour
      toute nouvelle action/route. Limite : 5 échecs/IP et 20 au total par 15 min (table
      login_attempts). /api/cron/* passe avec `Authorization: Bearer CRON_SECRET`.
- [x] Étape 3 : publication. lib/social : interface SocialProvider (types.ts), instagram.ts,
      tiktok.ts, simulation.ts ; getProvider() choisit la simulation sauf si DRY_RUN=false (défaut
      sûr). Identifiants simulés préfixés « sim_ » (un compte simulé ne sert pas en mode réel, et
      inversement). Tokens chiffrés AES-256-GCM (lib/crypto.ts, TOKEN_ENCRYPTION_KEY), renouvelés
      à l'usage (lib/accounts.ts getTokens). OAuth : /api/social/[platform]/connect et /callback
      (state en cookie httpOnly). lib/publish.ts : publishVideo enregistre chaque étape en base
      (processing + externalId, published, failed + raison) ; suivi 4 min max dans /api/publish
      (maxDuration 300) ; « Vérifier » reprend un suivi, « Réessayer » relance. UI :
      app/videos/publish-section.tsx. Prod : DRY_RUN=false. TikTok connecté via une app en Sandbox
      (clé et secret du Sandbox ; Content Posting API + scopes user.info.basic, video.upload,
      video.list ; compte de Victor en Target user). App Instagram pas encore créée.
- [x] Publication automatique à la création : légende + hashtags (colonne videos.caption) et
      options TikTok (videos.tiktok_options) saisies dans « Créer » ; cases « Publier sur … dès la
      création » (comptes connectés) ; après le rendu, le navigateur appelle /api/publish pour
      chaque réseau coché. /api/publish lit légende et options sur la vidéo (et les met à jour si
      fournies). Scope TikTok video.publish à ajouter dans l'app (Direct Post activé).
- [x] Bibliothèque d'images (table images, lib/image-library.ts, app/image-library.tsx) : chaque
      photo utilisée entre automatiquement (empreinte SHA-256, sans doublon) ; « Bibliothèque »
      dans Créer pour la réutiliser (imageId envoyé à /api/preview et /api/render, rien n'est
      renvoyé) ; « Gérer » pour en retirer. Migration 0009 : reprise des photos des anciennes
      vidéos ; leurs doublons sont fusionnés à l'ouverture (empreinte calculée à la volée).
      Supprimer une vidéo garde sa photo si elle est en bibliothèque.
      Clips et GIF aussi (colonne images.kind : image / video / gif ; sans empreinte, ajoutés au
      rendu par storeClip ; migration 0011 pour les anciens) : réutilisés par leur URL de stockage
      (dimensions et durée relues par le navigateur), donc sans nouvel envoi.
- [x] Refonte de l'interface selon les règles « Design » (barre d'onglets en bas, blocs, action
      principale collée en bas de « Créer », options repliées).
- [ ] Étape 4 : tableau de bord des vues (liste, totaux, courbes, Vercel Cron quotidien,
      bouton "Actualiser", import des anciennes vidéos)
- [ ] Étape 4 bis : file de publication automatique (demande de Victor). Les vidéos sont ajoutées
      à une file ordonnée, publiées une par une aux heures de plus forte activité des abonnés.
      Heures prises dans les insights Instagram (`online_followers`, à vérifier dans la doc Meta),
      sinon calculées depuis les vues de ses propres vidéos, sinon créneaux réglés à la main.
      Contraintes : le cron Vercel Hobby tourne une fois par jour au plus, à ±59 min près
      (https://vercel.com/docs/cron-jobs/usage-and-pricing), donc il faut un planificateur externe
      qui appelle une route protégée par secret, ou Vercel Pro. Côté TikTok, sans audit, la
      publication se fait en brouillon ou en privé : ce n'est pas vraiment automatique.
- [x] Étape 5 : PWA. app/manifest.ts (standalone, portrait, sombre), icônes public/icons
      (générées une fois : dégradé + cadre 9:16 ; maskable avec marge), appleWebApp dans le layout,
      marges safe-area. public/sw.js : aucun cache sauf public/offline.html, affichée quand une
      page ne charge pas faute de réseau. Manifest, sw.js, offline.html et icons/ sont exclus de
      proxy.ts (chargés sans cookie).
- [x] Nettoyage hebdomadaire des déploiements Vercel : .github/workflows/vercel-cleanup.yml lance
      `vercel remove vertical --safe` (secret GitHub VERCEL_TOKEN). Ne jamais retirer `--safe` :
      sans lui, le projet entier est supprimé.
- [ ] Étape 6 : finitions (erreurs, chargements, README final, checklist de mise en production)
