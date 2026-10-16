import { del, put } from "@vercel/blob";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Le stockage des vidéos n'est pas configuré : relie un store Vercel Blob au projet puis redéploie.");
  }
}

/**
 * Vercel Blob est utilisé sur Vercel (identifiants trouvés par @vercel/blob : BLOB_READ_WRITE_TOKEN,
 * ou OIDC avec BLOB_STORE_ID), ou en local si un token est fourni.
 */
export function usesVercelBlob() {
  return Boolean(process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN);
}

export type StoredFile = { url: string; downloadUrl: string };

/** Dossier de repli en local, quand Vercel Blob n'est pas configuré (dev uniquement). */
const LOCAL_DIR = join(process.cwd(), ".data", "files");

/**
 * Enregistre un fichier et renvoie son URL publique.
 * Vercel Blob en production ; en local sans token, le disque (servi par /api/files/[name]).
 */
export async function saveFile(name: string, data: Buffer, contentType: string): Promise<StoredFile> {
  if (usesVercelBlob()) {
    try {
      const blob = await put(name, data, { access: "public", contentType, addRandomSuffix: true });
      return { url: blob.url, downloadUrl: blob.downloadUrl };
    } catch (error) {
      if (error instanceof Error && /no blob credentials/i.test(error.message)) {
        throw new StorageNotConfiguredError();
      }
      throw error;
    }
  }
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

/** Supprime des fichiers enregistrés par saveFile (les URL inconnues sont ignorées). */
export async function deleteFiles(urls: (string | null | undefined)[]): Promise<void> {
  const list = urls.filter((u): u is string => Boolean(u));
  const local = list.filter((u) => u.startsWith("/api/files/"));
  const remote = list.filter((u) => /^https:\/\/[^/]+\.blob\.vercel-storage\.com\//.test(u));
  if (remote.length && usesVercelBlob()) await del(remote);
  if (!process.env.VERCEL) {
    for (const u of local) {
      const name = decodeURIComponent(u.slice("/api/files/".length).split("?")[0]);
      if (name === basename(name)) await rm(join(LOCAL_DIR, name), { force: true });
    }
  }
}
