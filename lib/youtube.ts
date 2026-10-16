import { execFile } from "node:child_process";
import { access, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

/*
 * Recherche YouTube et extraction d'un court extrait audio, via le binaire yt-dlp
 * (installé au build par scripts/fetch-yt-dlp.mjs).
 *
 * YouTube bloque les téléchargements depuis les serveurs (« confirm you're not a bot ») :
 * il faut fournir les cookies d'un compte YouTube (secondaire) dans YOUTUBE_COOKIES.
 */

export const YT_DLP_PATH = join(process.cwd(), "bin", "yt-dlp");

/** Longueur max d'un extrait, en secondes (= durée max d'une vidéo ; 90 s ≈ 1,4 Mo en MP3). */
export const EXCERPT_MAX = 90;
/** On refuse les vidéos trop longues (mix d'une heure…) pour garder un téléchargement léger. */
const MAX_SOURCE_DURATION = 20 * 60;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export class YoutubeError extends Error {}

export type SearchResult = {
  id: string;
  title: string;
  channel: string;
  duration: number | null;
  thumbnail: string;
};

export async function ytDlpAvailable() {
  return access(YT_DLP_PATH).then(() => true, () => false);
}

/** Vrai si YOUTUBE_COOKIES contient au moins un cookie YouTube lisible. */
export function cookiesConfigured() {
  return cookieFileContent() !== null;
}

/**
 * Remet chaque ligne de cookie au format Netscape (7 colonnes séparées par des tabulations) :
 * un copier-coller transforme souvent les tabulations en espaces. Les commentaires sont ignorés.
 */
export function normalizeCookies(text: string): string | null {
  const lines = text
    .replace(/\\n/g, "\n")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/\s+/))
    .filter((cols) => cols.length >= 7 && /youtube\.com|google\.com/.test(cols[0]))
    .map((cols) => [...cols.slice(0, 6), cols.slice(6).join(" ")].join("\t"));
  return lines.length ? `# Netscape HTTP Cookie File\n${lines.join("\n")}\n` : null;
}

/** Contenu du fichier cookies : accepté tel quel (tabulations ou espaces) ou encodé en base64. */
function cookieFileContent(): string | null {
  const raw = process.env.YOUTUBE_COOKIES?.trim();
  if (!raw) return null;
  return normalizeCookies(raw) ?? normalizeCookies(Buffer.from(raw, "base64").toString("utf8"));
}

function run(bin: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new YoutubeError(String(stderr || error.message)));
      else resolve(stdout);
    });
  });
}

/** Traduit les erreurs de yt-dlp en messages clairs. */
function explain(error: unknown): YoutubeError {
  const msg = error instanceof Error ? error.message : String(error);
  console.error("yt-dlp :", msg.slice(-1000));
  if (/not a bot|sign in to confirm|cookies/i.test(msg)) {
    return new YoutubeError(
      cookiesConfigured()
        ? "YouTube bloque le téléchargement : les cookies YouTube ont sans doute expiré. Renouvelle YOUTUBE_COOKIES."
        : "YouTube bloque le téléchargement depuis le serveur : ajoute les cookies d'un compte YouTube (variable YOUTUBE_COOKIES).",
    );
  }
  if (/private video|video unavailable|removed|copyright/i.test(msg)) {
    return new YoutubeError("Cette vidéo YouTube n'est pas disponible.");
  }
  if (/age|inappropriate/i.test(msg)) {
    return new YoutubeError("Cette vidéo est soumise à une limite d'âge : elle n'est pas récupérable.");
  }
  if (/timed out|ETIMEDOUT|SIGTERM/i.test(msg)) {
    return new YoutubeError("YouTube met trop de temps à répondre. Réessaie.");
  }
  return new YoutubeError("La récupération depuis YouTube a échoué.");
}

/** Options communes : pas de playlist, runtime JavaScript = le Node de la fonction, cookies. */
async function baseArgs(dir: string): Promise<string[]> {
  const args = ["--no-warnings", "--no-playlist", "--no-progress", "--js-runtimes", `node:${process.execPath}`];
  const cookies = cookieFileContent();
  if (cookies) {
    const path = join(dir, "cookies.txt");
    await writeFile(path, cookies);
    args.push("--cookies", path);
  }
  return args;
}

export async function searchYoutube(query: string): Promise<SearchResult[]> {
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  const dir = await mkdtemp(join(tmpdir(), "yt-"));
  try {
    const out = await run(
      YT_DLP_PATH,
      [...(await baseArgs(dir)), "--flat-playlist", "-J", `ytsearch8:${q}`],
      25_000,
    ).catch((e) => {
      throw explain(e);
    });
    const data = JSON.parse(out) as { entries?: Record<string, unknown>[] };
    return (data.entries ?? [])
      .filter((e) => typeof e.id === "string" && VIDEO_ID.test(e.id))
      .map((e) => ({
        id: e.id as string,
        title: String(e.title ?? ""),
        channel: String(e.channel ?? e.uploader ?? ""),
        duration: typeof e.duration === "number" ? e.duration : null,
        thumbnail: `https://i.ytimg.com/vi/${e.id}/mqdefault.jpg`,
      }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Récupère un extrait audio (MP3) d'une vidéo YouTube : télécharge la piste audio seule,
 * puis la découpe localement avec ffmpeg.
 */
export async function youtubeExcerpt(
  id: string,
  start: number,
  length: number,
): Promise<{ mp3: Buffer; title: string }> {
  if (!VIDEO_ID.test(id)) throw new YoutubeError("Vidéo YouTube invalide.");
  if (!ffmpegPath) throw new YoutubeError("ffmpeg est introuvable sur le serveur.");
  const dir = await mkdtemp(join(tmpdir(), "yt-"));
  try {
    const out = await run(
      YT_DLP_PATH,
      [
        ...(await baseArgs(dir)),
        "-f", "bestaudio[ext=m4a]/bestaudio",
        "--match-filter", `duration <= ${MAX_SOURCE_DURATION}`,
        "--max-filesize", "60M",
        "-o", join(dir, "source.%(ext)s"),
        "--print", "after_move:title",
        `https://www.youtube.com/watch?v=${id}`,
      ],
      45_000,
    ).catch((e) => {
      throw explain(e);
    });
    const source = (await readdir(dir)).find((f) => f.startsWith("source."));
    if (!source) {
      throw new YoutubeError("Vidéo trop longue (20 min max) ou fichier audio trop lourd.");
    }

    const mp3Path = join(dir, "extrait.mp3");
    await run(
      ffmpegPath,
      [
        "-hide_banner", "-loglevel", "error",
        "-ss", start.toFixed(3),
        "-t", Math.min(length, EXCERPT_MAX).toFixed(3),
        "-i", join(dir, source),
        "-vn", "-c:a", "libmp3lame", "-b:a", "128k",
        "-y", mp3Path,
      ],
      20_000,
    ).catch(() => {
      throw new YoutubeError("Le découpage de l'extrait a échoué (point de départ après la fin ?).");
    });
    const mp3 = await readFile(mp3Path);
    if (mp3.length < 1000) throw new YoutubeError("L'extrait est vide : le point de départ dépasse la fin du son.");
    return { mp3, title: out.trim().split("\n").pop() || id };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
