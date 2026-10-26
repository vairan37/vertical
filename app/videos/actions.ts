"use server";

import { requireAuth } from "@/lib/auth";
import { and, eq, isNull, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { getDb, publications, videos } from "@/lib/db";
import { isLibraryImage } from "@/lib/image-library";
import { deleteFiles } from "@/lib/storage";
import type { Platform } from "@/lib/db";

const PLATFORMS: Platform[] = ["instagram", "tiktok"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Marque à la main une vidéo comme publiée (ou non) sur une plateforme, en attendant la
 * publication automatique. Une publication faite par l'API (avec id externe) n'est jamais effacée.
 */
export async function setManualPublication(videoId: string, platform: Platform, published: boolean) {
  await requireAuth();
  if (!UUID.test(videoId) || !PLATFORMS.includes(platform)) throw new Error("Requête invalide.");
  const db = getDb();
  if (published) {
    const now = new Date();
    await db
      .insert(publications)
      .values({ videoId, platform, status: "published", publishedAt: now })
      .onConflictDoUpdate({
        target: [publications.videoId, publications.platform],
        set: { status: "published", error: null, publishedAt: now, updatedAt: now },
      });
  } else {
    await db
      .delete(publications)
      .where(
        and(
          eq(publications.videoId, videoId),
          eq(publications.platform, platform),
          isNull(publications.externalId),
        ),
      );
  }
  refresh();
}

/**
 * Abandonne une publication en cours ou échouée (efface son suivi, pas ce qui serait déjà sur le
 * réseau). Une publication réussie n'est jamais effacée ici.
 */
export async function cancelPublication(videoId: string, platform: Platform) {
  await requireAuth();
  if (!UUID.test(videoId) || !PLATFORMS.includes(platform)) throw new Error("Requête invalide.");
  await getDb()
    .delete(publications)
    .where(and(eq(publications.videoId, videoId), eq(publications.platform, platform), ne(publications.status, "published")));
  refresh();
}

/** Renomme une vidéo (nom vide : on revient au texte de la vidéo). Renvoie une erreur ou null. */
export async function renameVideo(id: string, title: string): Promise<string | null> {
  await requireAuth();
  if (!UUID.test(id)) return "Vidéo introuvable.";
  const clean = title.trim().slice(0, 80) || null;
  const updated = await getDb().update(videos).set({ title: clean }).where(eq(videos.id, id)).returning({ id: videos.id });
  if (updated.length === 0) return "Cette vidéo n'existe plus.";
  refresh();
  return null;
}

/**
 * Supprime une vidéo : la ligne en base (publications et stats suivent en cascade) et ses fichiers
 * dans le stockage. Ne supprime rien sur Instagram ni TikTok. Renvoie une erreur ou null.
 */
export async function deleteVideo(id: string): Promise<string | null> {
  await requireAuth();
  if (!UUID.test(id)) return "Vidéo introuvable.";
  const [deleted] = await getDb().delete(videos).where(eq(videos.id, id)).returning();
  if (!deleted) return "Cette vidéo n'existe plus.";
  try {
    // La photo et le clip restent s'ils sont dans la bibliothèque (réutilisables).
    const keepImage = await isLibraryImage(deleted.imageUrl);
    const keepClip = deleted.sourceVideoUrl ? await isLibraryImage(deleted.sourceVideoUrl) : false;
    await deleteFiles([deleted.videoUrl, keepImage ? null : deleted.imageUrl, deleted.coverUrl, keepClip ? null : deleted.sourceVideoUrl]);
  } catch (error) {
    // La vidéo est déjà retirée de la base : un fichier orphelin n'est pas bloquant.
    console.error("Suppression des fichiers incomplète", error);
  }
  return null;
}
