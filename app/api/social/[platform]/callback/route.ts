import { cookies } from "next/headers";
import { saveAccount } from "@/lib/accounts";
import { denyUnauthenticated } from "@/lib/auth";
import { OAUTH_STATE_COOKIE, parsePlatform, redirectUri } from "@/lib/oauth";
import { safeEqual } from "@/lib/session";
import { getProvider, SocialError } from "@/lib/social";

/** GET : retour d'Instagram ou de TikTok après autorisation ; enregistre le compte (tokens chiffrés). */
export async function GET(request: Request, ctx: RouteContext<"/api/social/[platform]/callback">) {
  const denied = await denyUnauthenticated();
  if (denied) return denied;
  const platform = parsePlatform((await ctx.params).platform);
  if (!platform) return Response.json({ error: "Plateforme inconnue." }, { status: 404 });

  const back = (params: Record<string, string>) =>
    Response.redirect(new URL(`/publiees?${new URLSearchParams(params)}`, request.url), 302);
  const params = new URL(request.url).searchParams;
  const jar = await cookies();
  const expected = jar.get(OAUTH_STATE_COOKIE)?.value;
  jar.delete({ name: OAUTH_STATE_COOKIE, path: "/api/social" });

  if (params.get("error")) {
    const refused = /denied|cancel/i.test(params.get("error") ?? "");
    return back({ erreur: refused ? "Connexion annulée." : `Connexion refusée : ${params.get("error_description") ?? params.get("error")}` });
  }
  const state = params.get("state") ?? "";
  const code = params.get("code");
  if (!code || !expected || !safeEqual(state, expected)) {
    return back({ erreur: "Connexion expirée ou invalide : recommence depuis le bouton « Connecter »." });
  }

  try {
    const tokens = await getProvider(platform).exchangeCode(code, redirectUri(request, platform));
    await saveAccount(platform, tokens);
    return back({ connecte: platform });
  } catch (error) {
    console.error(`Connexion ${platform} impossible`, error);
    return back({ erreur: error instanceof SocialError || error instanceof Error ? error.message : "Connexion impossible." });
  }
}
