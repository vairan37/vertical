import { access } from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";
import { DbNotConfiguredError, getDb, videos } from "@/lib/db";
import { listMusic, MAX_UPLOADED_MUSIC_BYTES, resolveMusic } from "@/lib/music";
import { imageSize } from "@/lib/image-size";
import { saveFile, StorageNotConfiguredError, usesVercelBlob } from "@/lib/storage";
import { resolveTemplate } from "@/lib/templates";
import { MAX_DURATION, MAX_TEXT_LENGTH, MIN_DURATION, renderFrame } from "@/lib/template";
import { RenderError, renderVideo } from "@/lib/video";

export const maxDuration = 60;

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png"];

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Requête invalide : le formulaire n'a pas pu être lu (fichiers trop lourds ?).");
  }

  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0) return fail("Choisis une image.");
  if (!IMAGE_TYPES.includes(image.type)) return fail("L'image doit être au format JPEG ou PNG.");
  if (image.size > MAX_IMAGE_BYTES) return fail("L'image est trop lourde (4 Mo maximum).");

  const text = String(form.get("text") ?? "").trim();
  if (text.length > MAX_TEXT_LENGTH) return fail(`Le texte dépasse ${MAX_TEXT_LENGTH} caractères.`);

  const duration = Number(form.get("duration"));
  if (!Number.isFinite(duration) || duration < MIN_DURATION || duration > MAX_DURATION) {
    return fail(`La durée doit être comprise entre ${MIN_DURATION} et ${MAX_DURATION} secondes.`);
  }

  const start = Number(form.get("start") ?? 0);
  if (!Number.isFinite(start) || start < 0 || start > 3600) {
    return fail("Le point de départ de la musique est invalide.");
  }

  let music: { path: string } | { data: Buffer };
  let musicName: string;
  const musicFile = form.get("musicFile");
  if (musicFile instanceof File && musicFile.size > 0) {
    if (musicFile.size > MAX_UPLOADED_MUSIC_BYTES) return fail("La musique est trop lourde (3 Mo maximum).");
    if (musicFile.type && !musicFile.type.startsWith("audio/")) return fail("Le fichier de musique n'est pas un fichier audio.");
    music = { data: Buffer.from(await musicFile.arrayBuffer()) };
    musicName = musicFile.name || "fichier envoyé";
  } else {
    musicName = String(form.get("music") ?? "");
    const path = await resolveMusic(musicName);
    if (!path) return fail("Choisis une musique.");
    music = { path };
  }

  try {
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const size = imageSize(imageBuffer);
    if (!size || size.width === 0 || size.height === 0) return fail("L'image n'a pas pu être lue (JPEG ou PNG attendu).");
    const sourceImage = { dataUrl: `data:${image.type};base64,${imageBuffer.toString("base64")}`, ...size };
    const template = await resolveTemplate(String(form.get("templateId") ?? "") || null);
    const framePng = await renderFrame(sourceImage, text, template.settings);
    const mp4 = await renderVideo({ framePng, music, start, duration });

    const id = crypto.randomUUID();
    const ext = image.type === "image/png" ? "png" : "jpg";
    const [video, source] = await Promise.all([
      saveFile(`videos/${id}.mp4`, mp4, "video/mp4"),
      saveFile(`images/${id}.${ext}`, imageBuffer, image.type),
    ]);
    await getDb().insert(videos).values({
      id,
      text,
      videoUrl: video.url,
      downloadUrl: video.downloadUrl,
      imageUrl: source.url,
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
      return fail("La vidéo n'a pas pu être créée. Vérifie que la musique est un fichier audio valide.", 500);
    }
    return fail("La vidéo n'a pas pu être créée ou enregistrée (erreur inattendue du serveur).", 500);
  }
}

/** Diagnostic : ouvre /api/render dans le navigateur pour vérifier le serveur. */
export async function GET() {
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
    // Noms (jamais les valeurs) des variables liées à Blob, pour le diagnostic.
    variablesBlob: Object.keys(process.env).filter((k) => k.includes("BLOB")),
  });
}
