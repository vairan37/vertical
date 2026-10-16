import { desc, eq, inArray } from "drizzle-orm";
import { getDb, publications, templates, videos } from "./db";
import type { Platform } from "./db";

export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
];

export type Publication = typeof publications.$inferSelect;
export type VideoWithPublications = typeof videos.$inferSelect & {
  publications: Partial<Record<Platform, Publication>>;
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nom affiché : le nom donné, sinon le texte de la vidéo, sinon « Sans titre ». */
export function displayName(v: { title: string | null; text: string }) {
  return v.title || v.text || "Sans titre";
}

function byPlatform(pubs: Publication[]): Partial<Record<Platform, Publication>> {
  return Object.fromEntries(pubs.map((p) => [p.platform, p]));
}

/** Une vidéo avec ses publications et le nom de sa template, ou null. */
export async function getVideo(id: string) {
  if (!UUID.test(id)) return null;
  const db = getDb();
  const [row] = await db
    .select({ video: videos, templateName: templates.name })
    .from(videos)
    .leftJoin(templates, eq(templates.id, videos.templateId))
    .where(eq(videos.id, id));
  if (!row) return null;
  const pubs = await db.select().from(publications).where(eq(publications.videoId, id));
  return { ...row.video, templateName: row.templateName, publications: byPlatform(pubs) };
}

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
    publications: byPlatform(pubs.filter((p) => p.videoId === v.id)),
  }));
}
