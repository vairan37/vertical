import { and, eq } from "drizzle-orm";
import { getTokens } from "./accounts";
import { getDb, publications, videos } from "./db";
import type { Platform } from "./db";
import { getProvider, SocialError, type PublishState } from "./social";
import { parseTikTokOptions, tiktokOptionsError } from "./tiktok-options";
import type { Publication } from "./videos";

/** Instagram traite un Reel en 30 s à quelques minutes : on suit pendant 4 min au plus (route limitée à 300 s). */
const POLL_FOR_MS = 4 * 60 * 1000;
const POLL_EVERY_MS = 10 * 1000;
/** Une publication « en cours » sans identifiant depuis moins de 5 min : un autre envoi tourne déjà. */
const STARTING_LOCK_MS = 5 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function message(error: unknown): string {
  if (error instanceof SocialError) return error.message;
  console.error("Publication : erreur inattendue", error);
  return error instanceof Error && /fetch failed|ECONN|ETIMEDOUT/i.test(error.message)
    ? "Le réseau social ne répond pas : réessaie dans un moment."
    : "Erreur inattendue pendant la publication : réessaie.";
}

async function save(videoId: string, platform: Platform, values: Partial<typeof publications.$inferInsert>) {
  const now = new Date();
  const [row] = await getDb()
    .insert(publications)
    .values({ videoId, platform, ...values, updatedAt: now })
    .onConflictDoUpdate({ target: [publications.videoId, publications.platform], set: { ...values, updatedAt: now } })
    .returning();
  return row;
}

/**
 * Publie une vidéo sur une plateforme, ou reprend une publication en cours (« Vérifier »).
 * Légende et options TikTok : celles enregistrées sur la vidéo (videos.caption, tiktok_options).
 * Tout est enregistré en base : un échec garde sa raison et peut être relancé.
 */
export async function publishVideo(videoId: string, platform: Platform): Promise<Publication> {
  const db = getDb();
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId));
  if (!video) throw new SocialError("Vidéo introuvable.");
  const [existing] = await db
    .select()
    .from(publications)
    .where(and(eq(publications.videoId, videoId), eq(publications.platform, platform)));

  if (existing?.status === "published") return existing;
  if (existing?.status === "processing" && !existing.externalId && Date.now() - existing.updatedAt.getTime() < STARTING_LOCK_MS) {
    throw new SocialError("Une publication est déjà en cours d'envoi : patiente un instant.");
  }

  const provider = getProvider(platform);
  let externalId = existing?.status === "processing" ? existing.externalId : null;
  // Information à garder avec le statut (ex. : repli sur le brouillon TikTok).
  let note = existing?.status === "processing" ? existing.error : null;
  try {
    const tokens = await getTokens(platform);
    if (!externalId) {
      const tiktok = platform === "tiktok" ? parseTikTokOptions(video.tiktokOptions) : null;
      if (platform === "tiktok" && tiktok) {
        const invalid = tiktokOptionsError(tiktok);
        if (invalid) throw new SocialError(invalid);
      }
      await save(videoId, platform, { status: "processing", error: null, externalId: null, url: null });
      const started = await provider.start(
        { videoUrl: video.videoUrl, coverUrl: video.coverUrl, caption: video.caption ?? "", duration: video.duration, tiktok },
        tokens,
      );
      externalId = started.externalId;
      note = started.note ?? null;
      await save(videoId, platform, { status: "processing", externalId, error: note });
    }

    const deadline = Date.now() + POLL_FOR_MS;
    let result: PublishState = await provider.check(externalId, tokens);
    while (result.state === "processing" && result.waiting && Date.now() < deadline) {
      await sleep(POLL_EVERY_MS);
      result = await provider.check(externalId, tokens);
    }

    if (result.state === "published") {
      return save(videoId, platform, {
        status: "published",
        externalId: result.externalId ?? externalId,
        url: result.url,
        error: null,
        publishedAt: new Date(),
      });
    }
    if (result.state === "failed") {
      // Identifiant effacé : « Réessayer » relance un envoi complet.
      return save(videoId, platform, { status: "failed", externalId: null, error: result.error });
    }
    return save(videoId, platform, { status: "processing", externalId: result.externalId ?? externalId, error: note });
  } catch (error) {
    // Envoi déjà accepté par le réseau : on garde son identifiant, « Vérifier » reprendra le suivi
    // (relancer un envoi complet risquerait un doublon).
    if (externalId) return save(videoId, platform, { status: "processing", externalId, error: message(error) });
    return save(videoId, platform, { status: "failed", externalId: null, error: message(error) });
  }
}
