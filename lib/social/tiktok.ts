import { readJson, SocialError, type SocialProvider, type Tokens } from "./types";

/*
 * TikTok Content Posting API, en brouillon (« upload to inbox ») : la vidéo arrive dans l'appli
 * TikTok, Victor touche la notification pour la publier. Docs (developers.tiktok.com) :
 * login-kit-web, oauth-user-access-token-management, content-posting-api-reference-upload-video,
 * content-posting-api-media-transfer-guide, content-posting-api-reference-get-video-status.
 *
 * Envoi en FILE_UPLOAD (le serveur envoie le fichier) : PULL_FROM_URL exige un domaine vérifié
 * chez TikTok, impossible pour les URL Vercel Blob.
 */

const API = "https://open.tiktokapis.com";
const SCOPES = ["user.info.basic", "video.upload"];
/** Morceaux de 5 à 64 Mo ; sous 64 Mo, un seul morceau (le cas de nos vidéos). */
const CHUNK = 32 * 1024 * 1024;

function credentials() {
  const key = process.env.TIKTOK_CLIENT_KEY;
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  if (!key || !secret) {
    throw new SocialError("App TikTok non configurée : ajoute TIKTOK_CLIENT_KEY et TIKTOK_CLIENT_SECRET sur Vercel.");
  }
  return { key, secret };
}

const MESSAGES: Record<string, string> = {
  access_token_invalid: "Connexion TikTok expirée ou révoquée : reconnecte le compte (page Publiées).",
  scope_not_authorized: "Permission TikTok manquante : reconnecte le compte en acceptant l'envoi de vidéos.",
  rate_limit_exceeded: "TikTok limite le nombre de requêtes : réessaie dans une minute.",
  spam_risk_too_many_pending_share: "Trop de brouillons TikTok en attente (5 par 24 h) : publie ou supprime ceux de ton appli, puis réessaie.",
  spam_risk_user_banned_from_posting: "TikTok bloque temporairement les publications de ce compte.",
};

function tiktokError(data: Record<string, unknown>, action: string): SocialError {
  const error = (data.error ?? {}) as { code?: string; message?: string };
  console.error(`TikTok (${action}) :`, JSON.stringify(data).slice(0, 1000));
  const known = error.code ? MESSAGES[error.code] : undefined;
  return new SocialError(known ?? `TikTok a refusé (${action}) : ${error.message || error.code || "erreur inconnue"}.`);
}

/** Appel JSON authentifié ; toute réponse dont error.code n'est pas « ok » est une erreur. */
async function call(path: string, accessToken: string, body: unknown, action: string) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await readJson(res);
  if (!res.ok || (data.error as { code?: string } | undefined)?.code !== "ok") throw tiktokError(data, action);
  return (data.data ?? {}) as Record<string, unknown>;
}

async function tokenRequest(params: Record<string, string>, action: string): Promise<Omit<Tokens, "accountName">> {
  const { key, secret } = credentials();
  const res = await fetch(`${API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: key, client_secret: secret, ...params }),
    cache: "no-store",
  });
  const data = await readJson(res);
  if (!res.ok || typeof data.access_token !== "string") {
    console.error(`TikTok (${action}) :`, JSON.stringify(data).slice(0, 1000));
    throw new SocialError(`TikTok a refusé (${action}) : ${String(data.error_description ?? data.error ?? "erreur inconnue")}.`);
  }
  const now = Date.now();
  return {
    accountId: String(data.open_id),
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    expiresAt: new Date(now + Number(data.expires_in ?? 0) * 1000),
    refreshExpiresAt: data.refresh_expires_in ? new Date(now + Number(data.refresh_expires_in) * 1000) : null,
  };
}

export const tiktok: SocialProvider = {
  platform: "tiktok",

  authorizeUrl(redirectUri, state) {
    const params = new URLSearchParams({
      client_key: credentials().key,
      response_type: "code",
      scope: SCOPES.join(","),
      redirect_uri: redirectUri,
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const tokens = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri }, "connexion");
    const res = await fetch(`${API}/v2/user/info/?fields=open_id,display_name`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      cache: "no-store",
    });
    const user = ((await readJson(res)).data as { user?: { display_name?: string } } | undefined)?.user;
    return { ...tokens, accountName: user?.display_name ?? null };
  },

  async refresh(tokens) {
    // Token d'accès valable 24 h : renouvelé s'il expire dans moins de 10 minutes.
    if (!tokens.expiresAt || tokens.expiresAt.getTime() > Date.now() + 10 * 60 * 1000) return null;
    if (!tokens.refreshToken) throw new SocialError("Connexion TikTok expirée : reconnecte le compte.");
    const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken }, "renouvellement");
    return { ...fresh, accountName: tokens.accountName };
  },

  async start(input, tokens) {
    const res = await fetch(input.videoUrl, { cache: "no-store" });
    if (!res.ok) throw new SocialError("Impossible de relire la vidéo dans le stockage.");
    const video = Buffer.from(await res.arrayBuffer());
    const size = video.length;
    const chunkSize = size <= 64 * 1024 * 1024 ? size : CHUNK;
    const chunks = Math.max(1, Math.floor(size / chunkSize));

    const init = await call(
      "/v2/post/publish/inbox/video/init/",
      tokens.accessToken,
      { source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: chunks } },
      "envoi",
    );
    const uploadUrl = String(init.upload_url ?? "");
    if (!uploadUrl) throw new SocialError("TikTok n'a pas fourni d'adresse d'envoi.");

    for (let i = 0; i < chunks; i++) {
      const first = i * chunkSize;
      // Le dernier morceau absorbe le reste (jusqu'à 128 Mo).
      const last = i === chunks - 1 ? size - 1 : first + chunkSize - 1;
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(last - first + 1),
          "Content-Range": `bytes ${first}-${last}/${size}`,
        },
        body: video.subarray(first, last + 1),
      });
      if (put.status !== 201 && put.status !== 206) {
        console.error("TikTok (envoi du fichier) :", put.status, (await put.text()).slice(0, 500));
        throw new SocialError(`L'envoi du fichier à TikTok a échoué (code ${put.status}).`);
      }
    }
    return String(init.publish_id);
  },

  async check(publishId, tokens) {
    const data = await call("/v2/post/publish/status/fetch/", tokens.accessToken, { publish_id: publishId }, "suivi");
    switch (data.status) {
      case "PROCESSING_UPLOAD":
      case "PROCESSING_DOWNLOAD":
        return { state: "processing", waiting: true };
      case "SEND_TO_USER_INBOX":
        return { state: "processing", waiting: false };
      case "PUBLISH_COMPLETE": {
        const ids = data.publicaly_available_post_id;
        const postId = Array.isArray(ids) && ids.length ? String(ids[0]) : null;
        return { state: "published", externalId: postId ?? undefined, url: null };
      }
      case "FAILED":
        return { state: "failed", error: `TikTok a refusé la vidéo${data.fail_reason ? ` (${String(data.fail_reason)})` : ""}.` };
      default:
        return { state: "processing", waiting: true };
    }
  },
};
