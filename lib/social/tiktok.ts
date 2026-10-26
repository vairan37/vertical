import type { CreatorInfo, TikTokOptions } from "../tiktok-options";
import { readJson, SocialError, type SocialProvider, type Tokens } from "./types";

/*
 * TikTok Content Posting API. Docs (developers.tiktok.com) : login-kit-web,
 * oauth-user-access-token-management, content-posting-api-reference-direct-post,
 * content-posting-api-reference-query-creator-info, content-posting-api-reference-upload-video,
 * content-posting-api-media-transfer-guide, content-posting-api-reference-get-video-status.
 *
 * - Publication directe (video.publish) avec légende, visibilité et options : le mode normal.
 *   Tant que l'app n'est pas auditée par TikTok, tout est forcé en privé, et TikTok refuse même
 *   la publication vers un compte public (unaudited_client_can_only_post_to_private_accounts) :
 *   on se replie alors sur le brouillon (video.upload), que Victor finit dans l'appli.
 * - Sans options TikTok (anciennes vidéos), envoi en brouillon.
 *
 * Envoi en FILE_UPLOAD (le serveur envoie le fichier) : PULL_FROM_URL exige un domaine vérifié
 * chez TikTok, impossible pour les URL Vercel Blob.
 */

const API = "https://open.tiktokapis.com";
const SCOPES = ["user.info.basic", "video.publish", "video.upload"];
/** Morceaux de 5 à 64 Mo ; sous 64 Mo, un seul morceau (le cas de nos vidéos). */
const CHUNK = 32 * 1024 * 1024;

/** Identifiants de l'app (espaces et retours à la ligne d'un copier-coller retirés). */
function credentials() {
  const key = process.env.TIKTOK_CLIENT_KEY?.trim();
  const secret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  if (!key || !secret) {
    throw new SocialError("App TikTok non configurée : ajoute TIKTOK_CLIENT_KEY et TIKTOK_CLIENT_SECRET sur Vercel.");
  }
  return { key, secret };
}

const MESSAGES: Record<string, string> = {
  access_token_invalid: "Connexion TikTok expirée ou révoquée : reconnecte le compte (page Publiées).",
  scope_not_authorized:
    "Permission TikTok manquante : vérifie que video.publish et video.upload sont dans l'app TikTok, puis reconnecte le compte (page Publiées).",
  spam_risk_too_many_posts: "Nombre maximum de publications TikTok du jour atteint : réessaie demain.",
  reached_active_user_cap: "Quota quotidien de l'app TikTok atteint : réessaie demain.",
  privacy_level_option_mismatch: "Cette visibilité n'est pas autorisée par TikTok pour ton compte : choisis-en une autre.",
  rate_limit_exceeded: "TikTok limite le nombre de requêtes : réessaie dans une minute.",
  spam_risk_too_many_pending_share: "Trop de brouillons TikTok en attente (5 par 24 h) : publie ou supprime ceux de ton appli, puis réessaie.",
  spam_risk_user_banned_from_posting: "TikTok bloque temporairement les publications de ce compte.",
};

function tiktokError(data: Record<string, unknown>, action: string): SocialError {
  const error = (data.error ?? {}) as { code?: string; message?: string };
  console.error(`TikTok (${action}) :`, JSON.stringify(data).slice(0, 1000));
  const known = error.code ? MESSAGES[error.code] : undefined;
  return new SocialError(known ?? `TikTok a refusé (${action}) : ${error.message || error.code || "erreur inconnue"}.`, error.code);
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

const DRAFT_NOTE = "Brouillon envoyé dans ton appli TikTok : ouvre la notification pour publier, puis touche « Vérifier ».";

/** post_info de la publication directe : les interactions coupées dans le compte restent coupées. */
function postInfo(caption: string, o: TikTokOptions, creator: CreatorInfo) {
  return {
    title: caption.slice(0, 2200),
    privacy_level: o.privacyLevel,
    disable_comment: !o.allowComment || creator.commentDisabled,
    disable_duet: !o.allowDuet || creator.duetDisabled,
    disable_stitch: !o.allowStitch || creator.stitchDisabled,
    // 1 s : après le fondu d'entrée (la première image est noire).
    video_cover_timestamp_ms: 1000,
    brand_content_toggle: o.disclose && o.brandedContent,
    brand_organic_toggle: o.disclose && o.yourBrand,
  };
}

/** Initialise l'envoi (publication directe ou brouillon), envoie le fichier, renvoie le publish_id. */
async function upload(path: string, extra: Record<string, unknown>, video: Buffer<ArrayBuffer>, tokens: Tokens): Promise<string> {
  const size = video.length;
  const chunkSize = size <= 64 * 1024 * 1024 ? size : CHUNK;
  const chunks = Math.max(1, Math.floor(size / chunkSize));
  const init = await call(
    path,
    tokens.accessToken,
    { ...extra, source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: chunks } },
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

  async creatorInfo(tokens) {
    const data = await call("/v2/post/publish/creator_info/query/", tokens.accessToken, {}, "infos du compte");
    return {
      nickname: String(data.creator_nickname ?? tokens.accountName ?? ""),
      username: typeof data.creator_username === "string" ? data.creator_username : null,
      avatarUrl: typeof data.creator_avatar_url === "string" ? data.creator_avatar_url : null,
      privacyOptions: Array.isArray(data.privacy_level_options) ? data.privacy_level_options.map(String) : [],
      commentDisabled: data.comment_disabled === true,
      duetDisabled: data.duet_disabled === true,
      stitchDisabled: data.stitch_disabled === true,
      maxDurationSec: Number(data.max_video_post_duration_sec ?? 600),
    } satisfies CreatorInfo;
  },

  async start(input, tokens) {
    const res = await fetch(input.videoUrl, { cache: "no-store" });
    if (!res.ok) throw new SocialError("Impossible de relire la vidéo dans le stockage.");
    const video = Buffer.from(await res.arrayBuffer());

    if (!input.tiktok) {
      return { externalId: await upload("/v2/post/publish/inbox/video/init/", {}, video, tokens), note: DRAFT_NOTE };
    }
    // Infos du compte relues juste avant de publier (exigence TikTok) : visibilité et durée permises.
    const creator = await tiktok.creatorInfo!(tokens);
    if (!creator.privacyOptions.includes(input.tiktok.privacyLevel)) {
      throw new SocialError("Cette visibilité n'est pas disponible pour ton compte TikTok : choisis-en une autre.");
    }
    if (input.duration > creator.maxDurationSec) {
      throw new SocialError(`TikTok accepte ${creator.maxDurationSec} s maximum pour ton compte.`);
    }
    try {
      const externalId = await upload("/v2/post/publish/video/init/", { post_info: postInfo(input.caption, input.tiktok, creator) }, video, tokens);
      return { externalId };
    } catch (error) {
      if (!(error instanceof SocialError) || error.code !== "unaudited_client_can_only_post_to_private_accounts") throw error;
      const externalId = await upload("/v2/post/publish/inbox/video/init/", {}, video, tokens);
      return {
        externalId,
        note:
          "App TikTok pas encore auditée : TikTok refuse la publication directe sur un compte public. " +
          "Brouillon envoyé dans ton appli TikTok à la place : ouvre la notification, colle la légende, publie, puis touche « Vérifier ».",
      };
    }
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
