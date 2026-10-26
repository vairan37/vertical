import { createHash } from "node:crypto";
import { desc, eq, isNull } from "drizzle-orm";
import { getDb, images, videos } from "./db";
import { MAX_IMAGE_BYTES, sourceImageFromBuffer } from "./source-image";
import { deleteFiles, readStoredFile, saveFile } from "./storage";

/*
 * Bibliothèque d'images (table images) : chaque photo utilisée pour une vidéo y entre
 * automatiquement, sans doublon (empreinte SHA-256), et peut être réutilisée depuis « Créer ».
 */

export type LibraryImage = { id: string; url: string };

/** Les images, la dernière utilisée en premier. */
export async function listLibrary(): Promise<LibraryImage[]> {
  await mergeOldDuplicates();
  return getDb()
    .select({ id: images.id, url: images.url })
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
  const pending = await db.select().from(images).where(isNull(images.hash)).limit(30);
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

/** Une image de la bibliothèque, prête pour le rendu (et marquée comme utilisée si `touch`). */
export async function readLibraryImage(id: string, touch: boolean) {
  const db = getDb();
  const [row] = await db.select().from(images).where(eq(images.id, id));
  if (!row) return { error: "Cette image n'est plus dans la bibliothèque." } as const;
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
 * Retire une image de la bibliothèque. Le fichier n'est effacé que si aucune vidéo ne s'en sert
 * (les vidéos d'avant les couvertures l'affichent dans la grille).
 */
export async function removeLibraryImage(id: string): Promise<void> {
  const db = getDb();
  const [row] = await db.delete(images).where(eq(images.id, id)).returning();
  if (!row) return;
  const [used] = await db.select({ id: videos.id }).from(videos).where(eq(videos.imageUrl, row.url)).limit(1);
  if (!used) await deleteFiles([row.url]);
}

/** Vrai si l'URL est celle d'une image de la bibliothèque (à ne pas effacer avec une vidéo). */
export async function isLibraryImage(url: string): Promise<boolean> {
  const [row] = await getDb().select({ id: images.id }).from(images).where(eq(images.url, url)).limit(1);
  return Boolean(row);
}
