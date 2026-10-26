import { denyUnauthenticated } from "@/lib/auth";
import { isDryRun } from "@/lib/social";
import { parseTikTokOptionsJson } from "@/lib/tiktok-options";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { DbNotConfiguredError, getDb, videos } from "@/lib/db";
import { listMusic, MAX_UPLOADED_MUSIC_BYTES, resolveMusic } from "@/lib/music";
import { readLibraryImage, storeClip, storeImage } from "@/lib/image-library";
import { readSourceImage } from "@/lib/source-image";
import {
  downloadStoredFile,
  isStoredUrl,
  MAX_CLIP_BYTES,
  saveFile,
  StorageNotConfiguredError,
  usesVercelBlob,
} from "@/lib/storage";
import { resolveTemplate } from "@/lib/templates";
import { UUID } from "@/lib/videos";
import { cookiesConfigured, ytDlpAvailable } from "@/lib/youtube";
import { MAX_AUTHOR_LENGTH, MAX_DURATION, MAX_TEXT_LENGTH, MIN_DURATION, renderFrame } from "@/lib/template";
import { probeVideo, RenderError, renderClip, renderVideo } from "@/lib/video";

// 300 s : maximum du plan Hobby (Fluid compute). Un clip vidéo s'encode à peu près en temps réel.
export const maxDuration = 300;

const MAX_TITLE_LENGTH = 80;

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const denied = await denyUnauthenticated();
  if (denied) return denied;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Requête invalide : le formulaire n'a pas pu être lu (fichiers trop lourds ?).");
  }

  // Illustration : une photo (envoyée dans la requête) ou un clip vidéo (déjà envoyé dans le
  // stockage, trop lourd pour passer par ici).
  const clipUrl = String(form.get("clipUrl") ?? "");
  if (clipUrl && !isStoredUrl(clipUrl)) return fail("Le clip vidéo est introuvable. Renvoie-le.");
  // Photo : envoyée dans la requête, ou reprise de la bibliothèque (imageId).
  const imageId = String(form.get("imageId") ?? "");
  const source = clipUrl ? null : UUID.test(imageId) ? await readLibraryImage(imageId, true) : await readSourceImage(form.get("image"));
  if (source && "error" in source) return fail(source.error);

  const text = String(form.get("text") ?? "").trim();
  const title = String(form.get("title") ?? "").trim().slice(0, MAX_TITLE_LENGTH) || null;
  const author = String(form.get("author") ?? "").trim().slice(0, MAX_AUTHOR_LENGTH);
  if (text.length > MAX_TEXT_LENGTH) return fail(`Le texte dépasse ${MAX_TEXT_LENGTH} caractères.`);

  const duration = Math.round(Number(form.get("duration")));
  if (!Number.isFinite(duration) || duration < MIN_DURATION || duration > MAX_DURATION) {
    return fail(`La durée doit être comprise entre ${MIN_DURATION} et ${MAX_DURATION} secondes.`);
  }

  const start = Number(form.get("start") ?? 0);
  if (!Number.isFinite(start) || start < 0 || start > 3600) {
    return fail("Le point de départ de la musique est invalide.");
  }

  // Pas de musique choisie : vidéo muette (piste silencieuse).
  let music: { path: string } | { data: Buffer } | null = null;
  let musicName = "";
  const musicFile = form.get("musicFile");
  if (musicFile instanceof File && musicFile.size > 0) {
    if (musicFile.size > MAX_UPLOADED_MUSIC_BYTES) return fail("La musique est trop lourde (3 Mo maximum).");
    if (musicFile.type && !musicFile.type.startsWith("audio/")) return fail("Le fichier de musique n'est pas un fichier audio.");
    music = { data: Buffer.from(await musicFile.arrayBuffer()) };
    musicName = musicFile.name || "fichier envoyé";
  } else if (String(form.get("music") ?? "")) {
    musicName = String(form.get("music"));
    const path = await resolveMusic(musicName);
    if (!path) return fail("Cette musique n'existe plus. Choisis-en une autre.");
    music = { path };
  }

  let tmp: string | null = null;
  try {
    const template = await resolveTemplate(String(form.get("templateId") ?? "") || null);
    const id = crypto.randomUUID();
    let mp4: Buffer;
    let cover: Buffer;
    let imageUrl: string | null = null;

    if (source) {
      const framePng = await renderFrame(source.image, text, template.settings, { author });
      ({ mp4, cover } = await renderVideo({ framePng, music, start, duration }));
      // Bibliothèque : image déjà connue, ou nouvelle photo ajoutée (sans doublon).
      imageUrl = "url" in source && typeof source.url === "string" ? source.url : await storeImage(source.buffer, source.type);
    } else {
      tmp = await mkdtemp(join(tmpdir(), "clip-"));
      const clipPath = join(tmp, "clip");
      try {
        await downloadStoredFile(clipUrl, clipPath, MAX_CLIP_BYTES);
      } catch (error) {
        console.error("Clip introuvable", error);
        return fail("Le clip vidéo n'a pas pu être récupéré. Renvoie-le.");
      }
      const clip = await probeVideo(clipPath);
      const overlayPng = await renderFrame(null, text, template.settings, { overlayOnly: true, author });
      ({ mp4, cover } = await renderClip({ clipPath, clip, overlayPng, settings: template.settings, music, start, duration }));
    }

    // Clip ou GIF : gardé en bibliothèque pour être réutilisé.
    if (!source) await storeClip(clipUrl);

    const [video, coverFile] = await Promise.all([
      saveFile(`videos/${id}.mp4`, mp4, "video/mp4"),
      saveFile(`covers/${id}-cover.jpg`, cover, "image/jpeg"),
    ]);
    await getDb().insert(videos).values({
      id,
      title,
      text,
      author: author || null,
      caption: String(form.get("caption") ?? "").slice(0, 2200) || null,
      tiktokOptions: parseTikTokOptionsJson(String(form.get("tiktokOptions") ?? "")),
      videoUrl: video.url,
      downloadUrl: video.downloadUrl,
      // Pour un clip, l'« image source » est la couverture (la colonne est obligatoire).
      imageUrl: imageUrl ?? coverFile.url,
      coverUrl: coverFile.url,
      sourceVideoUrl: source ? null : clipUrl,
      musicName,
      duration,
      templateId: template.id,
    });
    return Response.json({ id, videoUrl: video.url, downloadUrl: video.downloadUrl });
  } catch (error) {
    console.error("Échec de la création de la vidéo", error);
    if (error instanceof DbNotConfiguredError || error instanceof StorageNotConfiguredError) {
      return fail(error.message, 500);
    }
    if (error instanceof RenderError) {
      return fail(
        source
          ? "La vidéo n'a pas pu être créée. Vérifie que la musique est un fichier audio valide."
          : "La vidéo n'a pas pu être créée. Vérifie que le clip et la musique sont des fichiers valides.",
        500,
      );
    }
    return fail("La vidéo n'a pas pu être créée ou enregistrée (erreur inattendue du serveur).", 500);
  } finally {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  }
}

/** Diagnostic : ouvre /api/render dans le navigateur pour vérifier le serveur. */
export async function GET() {
  const denied = await denyUnauthenticated();
  if (denied) return denied;
  const ffmpeg = ffmpegPath ? await access(ffmpegPath).then(() => true, () => false) : false;
  const music = await listMusic();
  return Response.json({
    ffmpeg: ffmpeg ? "OK" : "introuvable",
    musiques: music.length ? music : "aucune",
    base: process.env.DATABASE_URL ? "configurée" : "non configurée",
    stockage: !usesVercelBlob()
      ? "local (.data)"
      : process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID
        ? "Vercel Blob"
        : "non configuré",
    youtube: (await ytDlpAvailable())
      ? cookiesConfigured() ? "yt-dlp OK, cookies configurés" : "yt-dlp OK, cookies absents (téléchargement bloqué)"
      : "yt-dlp absent",
    // Prêt pour le mode réel ? (présence des variables, jamais leurs valeurs)
    publication: {
      mode: isDryRun() ? "simulation (mettre DRY_RUN=false pour publier pour de vrai)" : "RÉEL",
      chiffrement: (process.env.TOKEN_ENCRYPTION_KEY?.length ?? 0) >= 16 ? "OK" : "TOKEN_ENCRYPTION_KEY manquante",
      instagram: process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET ? "app configurée" : "INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET manquants",
      tiktok: process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET ? "app configurée" : "TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET manquants",
    },
    // Noms (jamais les valeurs) des variables liées à Blob, pour le diagnostic.
    variablesBlob: Object.keys(process.env).filter((k) => k.includes("BLOB")),
  });
}
