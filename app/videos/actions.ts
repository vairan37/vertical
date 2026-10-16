"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { getDb, publications, videos } from "@/lib/db";
import { deleteFiles } from "@/lib/storage";
import type { Platform } from "@/lib/db";

const PLATFORMS: Platform[] = ["instagram", "tiktok"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Marque à la main une vidéo comme publiée (ou non) sur une plateforme, en attendant la
 * publication automatique. Une publication faite par l'API (avec id externe) n'est jamais effacée.
 */
export async function setManualPublication(videoId: string, platform: Platform, published: boolean) {
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

/** Renomme une vidéo (nom vide : on revient au texte de la vidéo). Renvoie une erreur ou null. */
export async function renameVideo(id: string, title: string): Promise<string | null> {
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
  if (!UUID.test(id)) return "Vidéo introuvable.";
  const [deleted] = await getDb().delete(videos).where(eq(videos.id, id)).returning();
  if (!deleted) return "Cette vidéo n'existe plus.";
  try {
    await deleteFiles([deleted.videoUrl, deleted.imageUrl, deleted.coverUrl]);
  } catch (error) {
    // La vidéo est déjà retirée de la base : un fichier orphelin n'est pas bloquant.
    console.error("Suppression des fichiers incomplète", error);
  }
  return null;
}
