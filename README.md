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

## Utilisation

1. Choisis une photo (réduite à 2000 px dans le navigateur avant l'envoi).
2. Écris le texte (300 caractères max).
3. Choisis une musique de `public/music/` ou envoie un fichier audio (3 Mo max), règle le point de
   départ et la durée (3 à 15 s).
4. « Créer la vidéo » : le serveur génère un MP4 1080x1920 (H.264 + AAC, 30 fps).

Pour ajouter des musiques : dépose des fichiers `.mp3` dans `public/music/` et redéploie.
Pour changer le look des vidéos : modifie uniquement `lib/template.tsx`.

## Avancement

Voir [CLAUDE.md](./CLAUDE.md) pour la stack, la structure du code et le plan de travail.
