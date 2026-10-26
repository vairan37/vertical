import { getTokens } from "@/lib/accounts";
import { denyUnauthenticated } from "@/lib/auth";
import { getProvider, SocialError } from "@/lib/social";

/**
 * GET : infos du compte TikTok (pseudo, visibilités permises, interactions coupées, durée max),
 * relues à chaque affichage de l'écran de publication, comme l'exige TikTok.
 */
export async function GET() {
  const denied = await denyUnauthenticated();
  if (denied) return denied;
  try {
    const provider = getProvider("tiktok");
    const creator = await provider.creatorInfo!(await getTokens("tiktok"));
    return Response.json({ creator });
  } catch (error) {
    const message = error instanceof SocialError ? error.message : "Impossible de lire ton compte TikTok.";
    if (!(error instanceof SocialError)) console.error("Infos TikTok impossibles", error);
    return Response.json({ error: message }, { status: 400 });
  }
}
