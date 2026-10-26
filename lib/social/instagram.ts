import { readJson, SocialError, type SocialProvider, type Tokens } from "./types";

/*
 * Instagram API with Instagram Login (graph.instagram.com) : compte professionnel (Business ou
 * Créateur), sans Page Facebook. Doc :
 * - connexion : developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
 * - publication : developers.facebook.com/docs/instagram-platform/content-publishing
 * Reel : conteneur (media_type=REELS, video_url publique) -> status_code FINISHED -> media_publish.
 */

const GRAPH = "https://graph.instagram.com/v26.0";
const SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

/** Identifiants de l'app (espaces et retours à la ligne d'un copier-coller retirés). */
function credentials() {
  const id = process.env.INSTAGRAM_APP_ID?.trim();
  const secret = process.env.INSTAGRAM_APP_SECRET?.trim();
  if (!id || !secret) {
    throw new SocialError("App Instagram non configurée : ajoute INSTAGRAM_APP_ID et INSTAGRAM_APP_SECRET sur Vercel.");
  }
  return { id, secret };
}

/** Message clair à partir d'une erreur de l'API Graph. */
function graphError(data: Record<string, unknown>, action: string): SocialError {
  const error = (data.error ?? {}) as { message?: string; code?: number; error_user_msg?: string };
  console.error(`Instagram (${action}) :`, JSON.stringify(data).slice(0, 1000));
  if (error.code === 190) return new SocialError("Connexion Instagram expirée ou révoquée : reconnecte le compte (page Publiées).");
  if (error.code === 4 || error.code === 17 || error.code === 32 || error.code === 613) {
    return new SocialError("Instagram limite le nombre de requêtes : réessaie dans un moment.");
  }
  if (error.code === 10 || error.code === 200) {
    return new SocialError("Permission Instagram manquante : reconnecte le compte en acceptant la publication.");
  }
  return new SocialError(`Instagram a refusé (${action}) : ${error.error_user_msg ?? error.message ?? "erreur inconnue"}.`);
}

async function graph(path: string, params: Record<string, string>, action: string, method: "GET" | "POST" = "GET") {
  const body = new URLSearchParams(params);
  const res = await fetch(method === "GET" ? `${GRAPH}${path}?${body}` : `${GRAPH}${path}`, {
    method,
    body: method === "POST" ? body : undefined,
    cache: "no-store",
  });
  const data = await readJson(res);
  if (!res.ok || data.error) throw graphError(data, action);
  return data;
}

async function withProfile(accessToken: string, expiresIn: number): Promise<Tokens> {
  const me = await graph("/me", { fields: "user_id,username", access_token: accessToken }, "lecture du profil");
  return {
    accountId: String(me.user_id),
    accountName: typeof me.username === "string" ? `@${me.username}` : null,
    accessToken,
    refreshToken: null,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    refreshExpiresAt: null,
  };
}

export const instagram: SocialProvider = {
  platform: "instagram",

  authorizeUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_id: credentials().id,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(","),
      state,
    });
    return `https://www.instagram.com/oauth/authorize?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const { id, secret } = credentials();
    // 1. Token court (1 h)…
    const res = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
      cache: "no-store",
    });
    const data = await readJson(res);
    const short = (Array.isArray(data.data) ? data.data[0] : data) as { access_token?: string } | undefined;
    if (!res.ok || !short?.access_token) throw graphError(data, "connexion");
    // 2. … échangé contre un token long (60 jours).
    const long = await graph(
      "/access_token",
      { grant_type: "ig_exchange_token", client_secret: secret, access_token: short.access_token },
      "token longue durée",
    );
    return withProfile(String(long.access_token), Number(long.expires_in ?? 0));
  },

  async refresh(tokens, savedAt) {
    // Renouvelable une fois le token vieux de 24 h, tant qu'il n'a pas expiré : on le fait au plus une fois par jour.
    if (Date.now() - savedAt.getTime() < 24 * 60 * 60 * 1000) return null;
    if (tokens.expiresAt && tokens.expiresAt.getTime() < Date.now()) {
      throw new SocialError("Connexion Instagram expirée (60 jours sans renouvellement) : reconnecte le compte.");
    }
    const data = await graph("/refresh_access_token", { grant_type: "ig_refresh_token", access_token: tokens.accessToken }, "renouvellement");
    return { ...tokens, accessToken: String(data.access_token), expiresAt: new Date(Date.now() + Number(data.expires_in ?? 0) * 1000) };
  },

  async start(input, tokens) {
    const params: Record<string, string> = {
      media_type: "REELS",
      video_url: input.videoUrl,
      caption: input.caption,
      share_to_feed: "true",
      access_token: tokens.accessToken,
    };
    if (input.coverUrl) params.cover_url = input.coverUrl;
    const data = await graph(`/${tokens.accountId}/media`, params, "création du Reel", "POST");
    return String(data.id);
  },

  async check(containerId, tokens) {
    const container = await graph(`/${containerId}`, { fields: "status_code,status", access_token: tokens.accessToken }, "suivi du Reel");
    switch (container.status_code) {
      case "IN_PROGRESS":
        return { state: "processing", waiting: true };
      case "PUBLISHED":
        return { state: "published", url: null };
      case "EXPIRED":
        return { state: "failed", error: "Le Reel n'a pas été publié à temps (conteneur expiré) : relance la publication." };
      case "ERROR":
        return { state: "failed", error: `Instagram n'a pas pu traiter la vidéo${container.status ? ` (${container.status})` : ""}.` };
      case "FINISHED": {
        const published = await graph(
          `/${tokens.accountId}/media_publish`,
          { creation_id: containerId, access_token: tokens.accessToken },
          "publication",
          "POST",
        );
        const mediaId = String(published.id);
        const media = await graph(`/${mediaId}`, { fields: "permalink", access_token: tokens.accessToken }, "lien du Reel").catch(() => ({}));
        const permalink = (media as { permalink?: unknown }).permalink;
        return { state: "published", externalId: mediaId, url: typeof permalink === "string" ? permalink : null };
      }
      default:
        return { state: "processing", waiting: true };
    }
  },
};
