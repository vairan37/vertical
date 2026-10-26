import { createHash } from "node:crypto";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { getDb, images, videos } from "./db";
import { MAX_IMAGE_BYTES, sourceImageFromBuffer } from "./source-image";
import { deleteFiles, readStoredFile, saveFile } from "./storage";

/*
 * Bibliothèque (table images) : chaque photo (sans doublon, empreinte SHA-256) et chaque clip ou
 * GIF utilisés pour une vidéo y entrent automatiquement, et se réutilisent depuis « Créer ».
 */

export type LibraryKind = "image" | "video" | "gif";
export type LibraryImage = { id: string; url: string; kind: LibraryKind };

/** Les médias, le dernier utilisé en premier. */
export async function listLibrary(): Promise<LibraryImage[]> {
  await mergeOldDuplicates();
  return getDb()
    .select({ id: images.id, url: images.url, kind: images.kind })
    .from(images)
    .orderBy(desc(images.lastUsedAt))
    .limit(300);
}

/**
 * Les images d'avant la bibliothèque n'ont pas d'empreinte, et la même photo a pu être enregistrée
 * une fois par vidéo. On calcule leur empreinte (quelques-unes à chaque ouverture) et on fusionne
 * les doublons : la ligne en double disparaît de la bibliothèque, son fichier reste (une vidéo s'en sert).
 */
async function mergeOldDuplicates() {
  const db = getDb();
  const pending = await db
    .select()
    .from(images)
    .where(and(isNull(images.hash), eq(images.kind, "image")))
    .limit(30);
  for (const row of pending) {
    let hash: string;
    try {
      hash = createHash("sha256").update(await readStoredFile(row.url, MAX_IMAGE_BYTES)).digest("hex");
    } catch {
      // Fichier disparu : l'image ne peut plus servir.
      await db.delete(images).where(eq(images.id, row.id));
      continue;
    }
    const [twin] = await db.select().from(images).where(eq(images.hash, hash));
    if (twin) {
      if (row.lastUsedAt > twin.lastUsedAt) await db.update(images).set({ lastUsedAt: row.lastUsedAt }).where(eq(images.id, twin.id));
      await db.delete(images).where(eq(images.id, row.id));
    } else {
      await db.update(images).set({ hash }).where(eq(images.id, row.id));
    }
  }
}

/** Enregistre une photo envoyée (ou retrouve la même déjà en bibliothèque) ; renvoie son URL. */
export async function storeImage(buffer: Buffer, type: string): Promise<string> {
  const db = getDb();
  const hash = createHash("sha256").update(buffer).digest("hex");
  const [known] = await db.select().from(images).where(eq(images.hash, hash));
  if (known) {
    await db.update(images).set({ lastUsedAt: new Date() }).where(eq(images.id, known.id));
    return known.url;
  }
  const ext = type === "image/png" ? "png" : "jpg";
  const { url } = await saveFile(`images/${hash.slice(0, 16)}.${ext}`, buffer, type);
  await db.insert(images).values({ url, hash }).onConflictDoNothing();
  return url;
}

/** Ajoute un clip ou un GIF (déjà dans le stockage) à la bibliothèque, ou le marque comme utilisé. */
export async function storeClip(url: string): Promise<void> {
  const kind: LibraryKind = /\.gif(\?|$)/i.test(url) ? "gif" : "video";
  await getDb()
    .insert(images)
    .values({ url, kind })
    .onConflictDoUpdate({ target: images.url, set: { lastUsedAt: new Date() } });
}

/** Une image de la bibliothèque, prête pour le rendu (et marquée comme utilisée si `touch`). */
export async function readLibraryImage(id: string, touch: boolean) {
  const db = getDb();
  const [row] = await db.select().from(images).where(eq(images.id, id));
  if (!row || row.kind !== "image") return { error: "Cette image n'est plus dans la bibliothèque." } as const;
  let buffer: Buffer;
  try {
    buffer = await readStoredFile(row.url, MAX_IMAGE_BYTES);
  } catch (error) {
    console.error("Image de la bibliothèque illisible", error);
    return { error: "Cette image n'a pas pu être relue dans le stockage." } as const;
  }
  const source = sourceImageFromBuffer(buffer);
  if ("error" in source) return source;
  if (touch) await db.update(images).set({ lastUsedAt: new Date() }).where(eq(images.id, id));
  return { ...source, url: row.url };
}

/**
 * Retire une image ou un clip de la bibliothèque. Le fichier n'est effacé que si aucune vidéo ne
 * le référence (les vidéos d'avant les couvertures affichent leur photo dans la grille).
 */
export async function removeLibraryImage(id: string): Promise<void> {
  const db = getDb();
  const [row] = await db.delete(images).where(eq(images.id, id)).returning();
  if (!row) return;
  const [used] = await db
    .select({ id: videos.id })
    .from(videos)
    .where(or(eq(videos.imageUrl, row.url), eq(videos.sourceVideoUrl, row.url)))
    .limit(1);
  if (!used) await deleteFiles([row.url]);
}

/** Vrai si l'URL est celle d'un média de la bibliothèque (à ne pas effacer avec une vidéo). */
export async function isLibraryImage(url: string): Promise<boolean> {
  const [row] = await getDb().select({ id: images.id }).from(images).where(eq(images.url, url)).limit(1);
  return Boolean(row);
}
