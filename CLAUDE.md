@AGENTS.md

# vertical

Site perso (PWA, surtout utilisé sur téléphone) pour créer une vidéo verticale 9:16 à partir d'une
template fixe (seuls l'image, le texte et la musique changent), la publier en un clic sur Instagram
(Reels) et TikTok, et suivre les vues. Un seul utilisateur : Victor. Interface en français, échanges
en français (tutoiement).

**Priorité absolue : simplifier la création et la publication. À chaque choix, l'option la plus
simple qui fonctionne.**

## Stack

- Next.js 16 (App Router, TypeScript strict, Tailwind v4, Turbopack, `cacheComponents` activé)
- Hébergement Vercel, base Postgres (Neon) + Drizzle ORM (étape 1), stockage Vercel Blob (étape 1)
- Rendu vidéo côté serveur : frame via `ImageResponse` (`next/og`), puis `ffmpeg-static`
  assemble image + musique en MP4 (H.264 + AAC, 1080x1920, 30 fps, 3 à 15 s)

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
  nav.tsx             barre de navigation (Créer / Mes vidéos)
  page.tsx            page d'accueil -> outil de création
  creator.tsx         composant client de création (image, texte, musique, durée, aperçu)
  videos/             page "Mes vidéos" : historique + statut Instagram/TikTok, marquage manuel
  api/music/route.ts  GET : liste des musiques de public/music
  api/render/route.tsx POST multipart : génère le MP4, l'enregistre (stockage + base), renvoie l'URL
  api/files/[name]/   sert le stockage local (dev sans Vercel Blob)
lib/
  template.tsx        TOUTE l'apparence de la template (unique endroit à modifier pour le look)
  music.ts            liste/résolution des musiques (protection path traversal)
  video.ts            appel ffmpeg
  db/schema.ts        tables Drizzle : videos, publications, stats, social_accounts
  db/index.ts         connexion Postgres (driver pg, compatible Neon)
  storage.ts          Vercel Blob (ou disque local en dev)
  videos.ts           lecture des vidéos avec leurs publications
drizzle/              migrations SQL générées (ne pas modifier à la main)
scripts/migrate.mjs   applique les migrations (ignoré si DATABASE_URL absente)
assets/fonts/         police Montserrat ExtraBold (licence OFL)
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
      Testé en local (Postgres 16 + stockage disque). Reste : configurer Neon + Blob sur Vercel.
- [ ] Étape 2 : authentification (mot de passe unique, cookie httpOnly, limite de tentatives ;
      routes cron protégées par secret)
- [ ] Étape 3 : publication (SocialProvider + simulation, écran de publication, Instagram, TikTok,
      page "Comptes", README de création des apps)
- [ ] Étape 4 : tableau de bord des vues (liste, totaux, courbes, Vercel Cron quotidien,
      bouton "Actualiser", import des anciennes vidéos)
- [ ] Étape 5 : PWA (manifest, icônes, standalone, thème sombre, ergonomie mobile)
- [ ] Étape 6 : finitions (erreurs, chargements, README final, checklist de mise en production)
