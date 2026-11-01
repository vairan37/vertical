@AGENTS.md

# vertical

PWA perso (surtout sur téléphone) pour créer des vidéos verticales 9:16 (illustration + texte +
son, mis en page par une template), les publier sur TikTok (et Instagram plus tard) et suivre les
vues. Un seul utilisateur : Victor. Interface et échanges en français, tutoiement.

**Priorité absolue : l'option la plus simple qui fonctionne.** En ligne :
https://vertical-mu.vercel.app (mot de passe `APP_PASSWORD`).

## Reprendre le projet sur un PC (GitButler)

1. Cloner `vairan37/vertical` et l'ouvrir dans GitButler. **`main` est déployée automatiquement
   par Vercel** (production) ; `dev` et les autres branches donnent des déploiements de preview.
2. Travailler dans des branches GitButler, puis fusionner vers `main` pour mettre en ligne.
   Dans un dépôt géré par GitButler, ne pas faire de `git checkout` / `git commit` à la main sur
   la branche `gitbutler/workspace` : passer par GitButler. Jamais de force push sur `main`.
3. Installer et lancer (Node ≥ 20.9) :
   ```bash
   npm install
   cp .env.example .env.local   # puis remplir (voir ci-dessous)
   npm run dev                  # http://localhost:3000
   npm run lint && npm run build   # doivent passer avant chaque fusion vers main
   ```
4. `.env.local` pour développer : `DATABASE_URL` d'une base **de dev** (Postgres local ou une
   branche Neon, jamais la base de prod), `DRY_RUN=true` (simulation : rien n'est publié),
   `TOKEN_ENCRYPTION_KEY` (n'importe quelle longue chaîne). Sans `APP_PASSWORD`, le site est
   ouvert en local. Sans token Blob, les fichiers vont dans `.data/files`.
5. Les secrets de prod restent dans Vercel (Settings → Environment Variables), jamais dans le
   dépôt. Après un changement de variable : redéployer.

## Stack

Next.js 16 (App Router, TS strict, Tailwind v4, Turbopack, `cacheComponents`) · Vercel (Hobby,
Fluid, maxDuration ≤ 300 s) · Postgres Neon + Drizzle · Vercel Blob public (relié par OIDC,
`BLOB_STORE_ID`) · rendu : frame `ImageResponse` (Satori) + `ffmpeg-static` (MP4 H.264/AAC
1080x1920 30 fps, 3 à 90 s, faststart) · yt-dlp (binaire figé, téléchargé au build).

Commandes : `npm run db:generate` après une modif de `lib/db/schema.ts` (migration dans
`drizzle/`, appliquée par `npm run build`, donc à chaque déploiement). `GET /api/render` =
diagnostic (ffmpeg, base, stockage, YouTube, état de la publication).

## Règles

- Next 16 diffère de ce que tu connais : lire `node_modules/next/dist/docs/` avant de coder
  (`proxy.ts` au lieu de middleware, APIs de requête asynchrones, pas de `dynamic`/`revalidate`).
- Toute nouvelle Server Action appelle `requireAuth()`, toute route API `denyUnauthenticated()`
  (lib/auth.ts) ; proxy.ts protège déjà tout sauf /login, /conditions, /confidentialite et les
  fichiers de la PWA.
- Appels Instagram/TikTok uniquement via `SocialProvider` (lib/social), avec une simulation
  (`DRY_RUN`, activée sauf si `DRY_RUN=false`). Tokens chiffrés en base (AES-256-GCM).
- Erreurs claires en français ; échecs de publication enregistrés avec la raison, relançables.
- Ne jamais publier sur de vrais comptes sans accord de Victor ; aucune action destructive
  (suppression de données, force push) sans demander.
- Vérifier la doc officielle (developers.tiktok.com, Meta) avant de toucher une intégration ;
  signaler avec la source toute contrainte qui contredit la demande.
- Pas de dépendance inutile. Commits `feat:` / `fix:` / `chore:` / `docs:`.
- YouTube : ne pas ajouter de contournement anti-bot (rotation de clients…) ; les cookies d'un
  compte secondaire (`YOUTUBE_COOKIES`) sont la seule méthode.
- `.github/workflows/vercel-cleanup.yml` lance chaque lundi `vercel remove vertical --safe`
  (secret GitHub `VERCEL_TOKEN`). **Ne jamais retirer `--safe`** : sans lui, le projet entier
  est supprimé.

## Design (app/ui.ts)

Une colonne max-w-md, marges 16 px · une seule action principale par écran (`ui.primary`,
collée en bas sur « Créer ») · barre d'onglets en bas (Créer, Vidéos, Publiées, Templates) ·
blocs `ui.card` + titre `ui.label` · couleur = sens (vert ok, rouge erreur, ambre attention,
bleu lien) · options rares repliées · cibles ≥ 44 px · pas de texte d'aide superflu.

## Carte du code

- `app/creator.tsx` : page Créer (aperçu exact collé en haut, illustration, texte + auteur +
  template, son, publication). `app/page.tsx` lui passe templates, comptes, réglages TikTok.
- `app/api/render` : génère le MP4 (photo : 3 segments concaténés, rapide ; clip/GIF : fond +
  clip cadré + calque texte, ~temps réel). `app/api/preview` : aperçu JPEG (ou calque PNG).
- `lib/template.tsx` + `lib/template-settings.ts` : rendu de la frame et réglages de template
  (polices TTF statiques dans `assets/fonts`, pas de police variable).
- Bibliothèque (photos, clips, GIF) : `lib/image-library.ts`, `app/image-library.tsx`, table
  `images` (photos dédoublonnées par SHA-256 ; clips réutilisés par leur URL Blob).
- Son : bibliothèque `public/music`, fichier envoyé, ou extrait YouTube (`lib/youtube.ts`). La
  vidéo dure la longueur de l'extrait ; sans son, piste muette.
- Publication : `lib/publish.ts` (statuts, suivi 4 min, Vérifier/Réessayer), `lib/social/*`,
  `app/api/publish`, `app/videos/publish-section.tsx`, `app/tiktok-fields.tsx`.
- Comptes/OAuth : `app/api/social/[platform]/{connect,callback}`, `lib/accounts.ts`.
- Auth : `proxy.ts`, `lib/session.ts` (cookie signé 60 j), `lib/auth.ts` (5 essais/IP/15 min).
- PWA : `app/manifest.ts`, `public/sw.js` (page hors ligne seulement), `public/icons`.
- Piège Next 16 : une page quittée reste montée (React Activity) → les `<video>`/`<audio>`
  continuent ; utiliser `app/pausing-video.tsx` ou un nettoyage `useLayoutEffect`.

## Plateformes : état et contraintes

- **TikTok : connecté en prod via l'app en Sandbox** (clé et secret du Sandbox dans Vercel ;
  Login Kit + Content Posting API avec Direct Post ; scopes `user.info.basic`, `video.publish`,
  `video.upload`, `video.list` ; compte de Victor en Target user). Publication directe avec
  légende ; tant que l'app n'est pas auditée, tout est **privé**, et sur un compte public TikTok
  refuse (`unaudited_client_can_only_post_to_private_accounts`) → repli automatique en brouillon
  (notification dans l'appli TikTok). Envoi FILE_UPLOAD (PULL_FROM_URL exige un domaine
  vérifié). Visibilité et interactions choisies une fois dans Publiées → Réglages TikTok (table
  `publish_settings`) : écart possible avec les règles d'audit 2b/2c (pas de défaut) — si TikTok
  refuse, remettre le choix à chaque vidéo. Écran de publication conforme aux
  content-sharing-guidelines (compte, contenu commercial, accord musique).
- **Audit TikTok (pour publier en public)** : configurer l'app en Production (même config que
  le Sandbox), vérifier l'URL (URL prefix `https://vertical-mu.vercel.app/` : fichier de
  signature à mettre en ligne et à exclure de proxy.ts), App review avec vidéo de démo, puis
  formulaire https://developers.tiktok.com/application/content-posting-api. Ensuite : clé de
  Production dans Vercel et reconnexion.
- **Instagram : en pause** (inscription développeur Meta bloquée à la vérification du téléphone).
  Code prêt : « Instagram API with Instagram Login », sans Page Facebook ; manquent l'app Meta et
  `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`. Redirect URI :
  `https://vertical-mu.vercel.app/api/social/instagram/callback`.
- Variables de prod en place : `APP_PASSWORD`, `TOKEN_ENCRYPTION_KEY`, `DRY_RUN=false`,
  `TIKTOK_CLIENT_KEY/SECRET`, `YOUTUBE_COOKIES`, base Neon, Blob.

## À faire

- [ ] Audit TikTok (ci-dessus) ; textes d'App review et déroulé de la vidéo de démo.
- [ ] Étape 4 : suivi des vues (TikTok `video.list`, totaux, courbes, cron quotidien,
      « Actualiser »). Table `stats` déjà créée.
- [ ] File de publication automatique aux heures de forte activité. Cron Vercel Hobby = 1 fois
      par jour max (±59 min) → planificateur externe (ex. GitHub Actions) appelant une route
      `/api/cron/*` protégée par `Authorization: Bearer CRON_SECRET`, ou Vercel Pro.
- [ ] Instagram quand l'app Meta sera possible.
- [ ] Finitions : README final, checklist de mise en production ; supprimer
      `public/music/demo-test.mp3` et les vidéos de test « … (Claude) » en prod.
- Faille connue non corrigée : `zod` (via @vercel/blob → @vercel/oidc), en attente d'une mise
  à jour de @vercel/blob.
