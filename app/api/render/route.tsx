import { access } from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";
import { listMusic, MAX_UPLOADED_MUSIC_BYTES, resolveMusic } from "@/lib/music";
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
  const musicFile = form.get("musicFile");
  if (musicFile instanceof File && musicFile.size > 0) {
    if (musicFile.size > MAX_UPLOADED_MUSIC_BYTES) return fail("La musique est trop lourde (3 Mo maximum).");
    if (musicFile.type && !musicFile.type.startsWith("audio/")) return fail("Le fichier de musique n'est pas un fichier audio.");
    music = { data: Buffer.from(await musicFile.arrayBuffer()) };
  } else {
    const path = await resolveMusic(String(form.get("music") ?? ""));
    if (!path) return fail("Choisis une musique.");
    music = { path };
  }

  try {
    const imageDataUrl = `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`;
    const framePng = await renderFrame(imageDataUrl, text);
    const mp4 = await renderVideo({ framePng, music, start, duration });
    return new Response(new Uint8Array(mp4), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(mp4.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Échec du rendu vidéo", error);
    if (error instanceof RenderError) {
      return fail("La vidéo n'a pas pu être créée. Vérifie que la musique est un fichier audio valide.", 500);
    }
    return fail("La vidéo n'a pas pu être créée (erreur inattendue du serveur).", 500);
  }
}

/** Diagnostic : ouvre /api/render dans le navigateur pour vérifier le serveur. */
export async function GET() {
  const ffmpeg = ffmpegPath ? await access(ffmpegPath).then(() => true, () => false) : false;
  const music = await listMusic();
  return Response.json({
    ffmpeg: ffmpeg ? "OK" : "introuvable",
    musiques: music.length ? music : "aucune",
  });
}
