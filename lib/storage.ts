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

/** Taille max d'un clip vidéo envoyé depuis le téléphone. */
export const MAX_CLIP_BYTES = 200 * 1024 * 1024;

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

const BLOB_URL = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//;
const LOCAL_URL = /^\/api\/files\/([^/?#]+)$/;

/** Vrai si l'URL désigne un fichier de notre propre stockage (Blob du projet ou disque local). */
export function isStoredUrl(url: string) {
  return BLOB_URL.test(url) || (!process.env.VERCEL && LOCAL_URL.test(url));
}

/**
 * Lit un fichier de notre stockage, sans dépasser `maxBytes`.
 * Refuse toute autre URL : le serveur ne télécharge jamais une adresse arbitraire.
 */
export async function readStoredFile(url: string, maxBytes: number): Promise<Buffer> {
  const local = url.match(LOCAL_URL);
  if (local && !process.env.VERCEL) {
    const data = await readLocalFile(decodeURIComponent(local[1]));
    if (!data) throw new Error("Fichier introuvable.");
    if (data.length > maxBytes) throw new Error("Fichier trop lourd.");
    return data;
  }
  if (!BLOB_URL.test(url)) throw new Error("Adresse de fichier refusée.");
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (${res.status}).`);
  if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new Error("Fichier trop lourd.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Fichier trop lourd.");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Copie un fichier de notre stockage dans `dest` (dossier temporaire). Voir readStoredFile. */
export async function downloadStoredFile(url: string, dest: string, maxBytes: number): Promise<void> {
  await writeFile(dest, await readStoredFile(url, maxBytes));
}
