"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { getDb, publications } from "@/lib/db";
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
