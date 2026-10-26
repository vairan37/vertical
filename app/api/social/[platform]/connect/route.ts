import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { denyUnauthenticated } from "@/lib/auth";
import { OAUTH_STATE_COOKIE, parsePlatform, redirectUri } from "@/lib/oauth";
import { getProvider, SocialError } from "@/lib/social";

/** GET : part vers la page d'autorisation d'Instagram ou de TikTok (bouton « Connecter »). */
export async function GET(request: Request, ctx: RouteContext<"/api/social/[platform]/connect">) {
  const denied = await denyUnauthenticated();
  if (denied) return denied;
  const platform = parsePlatform((await ctx.params).platform);
  if (!platform) return Response.json({ error: "Plateforme inconnue." }, { status: 404 });

  const state = `${platform}.${randomBytes(24).toString("base64url")}`;
  try {
    const url = getProvider(platform).authorizeUrl(redirectUri(request, platform), state);
    (await cookies()).set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/social",
      maxAge: 15 * 60,
    });
    return Response.redirect(url, 302);
  } catch (error) {
    const message = error instanceof SocialError ? error.message : "Connexion impossible.";
    return Response.redirect(new URL(`/publiees?${new URLSearchParams({ erreur: message })}`, request.url), 302);
  }
}
