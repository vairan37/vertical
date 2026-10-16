import { desc, inArray } from "drizzle-orm";
import { getDb, publications, videos } from "./db";
import type { Platform } from "./db";

export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
];

export type Publication = typeof publications.$inferSelect;
export type VideoWithPublications = typeof videos.$inferSelect & {
  publications: Partial<Record<Platform, Publication>>;
};

/** Toutes les vidéos, la plus récente en premier, avec leur statut par plateforme. */
export async function listVideos(): Promise<VideoWithPublications[]> {
  const db = getDb();
  const rows = await db.select().from(videos).orderBy(desc(videos.createdAt));
  if (rows.length === 0) return [];
  const pubs = await db
    .select()
    .from(publications)
    .where(inArray(publications.videoId, rows.map((v) => v.id)));
  return rows.map((v) => ({
    ...v,
    publications: Object.fromEntries(
      pubs.filter((p) => p.videoId === v.id).map((p) => [p.platform, p]),
    ),
  }));
}
