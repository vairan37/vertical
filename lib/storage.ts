import { put } from "@vercel/blob";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Le stockage des vidéos n'est pas configuré (variable BLOB_READ_WRITE_TOKEN manquante).");
  }
}

export type StoredFile = { url: string; downloadUrl: string };

/** Dossier de repli en local, quand Vercel Blob n'est pas configuré (dev uniquement). */
const LOCAL_DIR = join(process.cwd(), ".data", "files");

/**
 * Enregistre un fichier et renvoie son URL publique.
 * Vercel Blob en production ; en local sans token, le disque (servi par /api/files/[name]).
 */
export async function saveFile(name: string, data: Buffer, contentType: string): Promise<StoredFile> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(name, data, { access: "public", contentType, addRandomSuffix: true });
    return { url: blob.url, downloadUrl: blob.downloadUrl };
  }
  if (process.env.VERCEL) throw new StorageNotConfiguredError();
  const file = basename(name);
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(join(LOCAL_DIR, file), data);
  const url = `/api/files/${encodeURIComponent(file)}`;
  return { url, downloadUrl: `${url}?download=1` };
}

/** Lit un fichier du stockage local (dev). Renvoie null si le nom est invalide ou absent. */
export async function readLocalFile(name: string): Promise<Buffer | null> {
  if (process.env.VERCEL || !name || name !== basename(name)) return null;
  return readFile(join(LOCAL_DIR, name)).catch(() => null);
}
