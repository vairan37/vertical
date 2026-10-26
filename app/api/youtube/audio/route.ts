import { denyUnauthenticated } from "@/lib/auth";
import { EXCERPT_MAX, youtubeExcerpt, YoutubeError } from "@/lib/youtube";

export const maxDuration = 60;

/**
 * POST /api/youtube/audio { id, start, length } : renvoie l'extrait en MP3 (15 s max, ~300 Ko).
 * Le titre de la vidéo est dans l'en-tête X-Title (encodé URI).
 */
export async function POST(request: Request) {
  const denied = await denyUnauthenticated();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { id?: unknown; start?: unknown; length?: unknown } | null;
  const id = String(body?.id ?? "");
  const start = Number(body?.start ?? 0);
  const length = Number(body?.length ?? EXCERPT_MAX);
  if (!Number.isFinite(start) || start < 0 || start > 20 * 60) {
    return Response.json({ error: "Le point de départ est invalide." }, { status: 400 });
  }
  if (!Number.isFinite(length) || length < 1) {
    return Response.json({ error: "La durée de l'extrait est invalide." }, { status: 400 });
  }
  try {
    const { mp3, title } = await youtubeExcerpt(id, start, length);
    return new Response(new Uint8Array(mp3), {
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Title": encodeURIComponent(title),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof YoutubeError ? error.message : "La récupération depuis YouTube a échoué.";
    console.error("Extrait YouTube impossible", error);
    return Response.json({ error: message }, { status: 502 });
  }
}
