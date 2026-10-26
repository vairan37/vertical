import { eq } from "drizzle-orm";
import { denyUnauthenticated } from "@/lib/auth";
import { getDb, videos } from "@/lib/db";
import { parsePlatform } from "@/lib/oauth";
import { publishVideo } from "@/lib/publish";
import { SocialError } from "@/lib/social";
import { parseTikTokOptions } from "@/lib/tiktok-options";
import { UUID } from "@/lib/videos";

/** Instagram peut mettre quelques minutes à traiter un Reel : le suivi tient dans cette limite. */
export const maxDuration = 300;

/**
 * POST {videoId, platform, caption?, tiktok?} : publie (ou reprend le suivi). Légende et options
 * TikTok, si fournies, sont d'abord enregistrées sur la vidéo. Renvoie la publication.
 */
export async function POST(request: Request) {
  const denied = await denyUnauthenticated();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as
    | { videoId?: unknown; platform?: unknown; caption?: unknown; tiktok?: unknown }
    | null;
  const platform = parsePlatform(String(body?.platform ?? ""));
  const videoId = String(body?.videoId ?? "");
  if (!platform || !UUID.test(videoId)) return Response.json({ error: "Requête invalide." }, { status: 400 });

  const changes: Partial<typeof videos.$inferInsert> = {};
  if (typeof body?.caption === "string") changes.caption = body.caption.slice(0, 2200);
  const tiktok = parseTikTokOptions(body?.tiktok);
  if (tiktok) changes.tiktokOptions = tiktok;
  try {
    if (Object.keys(changes).length) await getDb().update(videos).set(changes).where(eq(videos.id, videoId));
    return Response.json({ publication: await publishVideo(videoId, platform) });
  } catch (error) {
    const message = error instanceof SocialError ? error.message : "La publication a échoué.";
    if (!(error instanceof SocialError)) console.error("Publication impossible", error);
    return Response.json({ error: message }, { status: 400 });
  }
}
