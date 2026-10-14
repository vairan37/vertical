import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

export const MUSIC_DIR = join(process.cwd(), "public", "music");

/** Taille max d'une musique envoyée depuis le téléphone. */
export const MAX_UPLOADED_MUSIC_BYTES = 3 * 1024 * 1024;

/** Liste les fichiers .mp3 de public/music, triés par nom. */
export async function listMusic(): Promise<string[]> {
  try {
    const files = await readdir(MUSIC_DIR);
    return files.filter((f) => f.toLowerCase().endsWith(".mp3")).sort();
  } catch {
    return [];
  }
}

/**
 * Renvoie le chemin absolu d'une musique de la bibliothèque, ou null si le nom
 * est invalide. Le nom doit être exactement celui d'un fichier listé : aucun
 * chemin (../, /, \) n'est accepté, ce qui empêche le path traversal.
 */
export async function resolveMusic(name: string): Promise<string | null> {
  if (!name || name !== basename(name) || name.includes("\\")) return null;
  const available = await listMusic();
  if (!available.includes(name)) return null;
  return join(MUSIC_DIR, name);
}
