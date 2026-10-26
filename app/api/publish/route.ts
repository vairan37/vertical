import { denyUnauthenticated } from "@/lib/auth";
import { parsePlatform } from "@/lib/oauth";
import { publishVideo } from "@/lib/publish";
import { SocialError } from "@/lib/social";
import { UUID } from "@/lib/videos";

/** Instagram peut mettre quelques minutes à traiter un Reel : le suivi tient dans cette limite. */
export const maxDuration = 300;

/** POST {videoId, platform, caption} : publie (ou reprend le suivi). Renvoie la publication. */
export async function POST(request: Request) {
  const denied = await denyUnauthenticated();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { videoId?: unknown; platform?: unknown; caption?: unknown } | null;
  const platform = parsePlatform(String(body?.platform ?? ""));
  const videoId = String(body?.videoId ?? "");
  if (!platform || !UUID.test(videoId)) return Response.json({ error: "Requête invalide." }, { status: 400 });
  const caption = String(body?.caption ?? "").slice(0, 2200);
  try {
    return Response.json({ publication: await publishVideo(videoId, platform, caption) });
  } catch (error) {
    const message = error instanceof SocialError ? error.message : "La publication a échoué.";
    if (!(error instanceof SocialError)) console.error("Publication impossible", error);
    return Response.json({ error: message }, { status: 400 });
  }
}
