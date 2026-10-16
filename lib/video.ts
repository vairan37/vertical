import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { FADES, VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from "./template";

export class RenderError extends Error {}

type RenderOptions = {
  framePng: Buffer;
  /** Chemin d'une musique de la bibliothèque, ou contenu d'un fichier envoyé. */
  music: { path: string } | { data: Buffer };
  /** Point de départ dans la musique, en secondes. */
  start: number;
  /** Durée de la vidéo, en secondes. */
  duration: number;
};

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 50_000, maxBuffer: 10 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error) reject(new RenderError(stderr.trim().split("\n").slice(-3).join("\n") || error.message));
      else resolve();
    });
  });
}

/** Frame PNG -> JPEG 540x960 (couverture de la grille, aperçu de la page de création). */
function pngToJpeg(ffmpeg: string, input: string, output: string) {
  return run(ffmpeg, [
    "-hide_banner", "-loglevel", "error",
    "-i", input,
    "-vf", `scale=${VIDEO_WIDTH / 2}:${VIDEO_HEIGHT / 2}`,
    "-q:v", "4",
    "-y", output,
  ]);
}

/** Convertit une frame PNG en JPEG réduit, sans passer par une vidéo. */
export async function frameToJpeg(framePng: Buffer): Promise<Buffer> {
  if (!ffmpegPath) throw new RenderError("ffmpeg est introuvable sur le serveur.");
  const dir = await mkdtemp(join(tmpdir(), "vertical-"));
  try {
    await writeFile(join(dir, "frame.png"), framePng);
    await pngToJpeg(ffmpegPath, join(dir, "frame.png"), join(dir, "frame.jpg"));
    return await readFile(join(dir, "frame.jpg"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Assemble l'image et la musique en MP4 (H.264 + AAC, 1080x1920, 30 fps), et produit aussi la
 * couverture (la frame en JPEG 540x960) pour la grille « Mes vidéos ».
 */
export async function renderVideo({ framePng, music, start, duration }: RenderOptions): Promise<{ mp4: Buffer; cover: Buffer }> {
  if (!ffmpegPath) throw new RenderError("ffmpeg est introuvable sur le serveur.");
  const ffmpeg = ffmpegPath;

  const dir = await mkdtemp(join(tmpdir(), "vertical-"));
  try {
    const framePath = join(dir, "frame.png");
    const outPath = join(dir, "video.mp4");
    const coverPath = join(dir, "cover.jpg");
    await writeFile(framePath, framePng);

    let musicPath: string;
    if ("path" in music) {
      musicPath = music.path;
    } else {
      musicPath = join(dir, "music");
      await writeFile(musicPath, music.data);
    }

    // L'image est fixe : au lieu d'encoder chaque image (lent pour 90 s), on encode trois petits
    // segments (fondu d'entrée 1 s, image fixe 1 s et 5 s, fondu de sortie 1 s) et on les enchaîne
    // par copie avec le démultiplexeur concat. Chaque segment commence par une image clé.
    const total = Math.round(duration);
    const encodeSegment = (name: string, seconds: number, fade: string) =>
      run(ffmpeg, [
        "-hide_banner", "-loglevel", "error",
        "-loop", "1",
        "-framerate", String(VIDEO_FPS),
        "-i", framePath,
        "-t", String(seconds),
        "-vf", [`scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}`, "format=yuv420p", fade].filter(Boolean).join(","),
        "-r", String(VIDEO_FPS),
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-tune", "stillimage",
        "-crf", "21",
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        "-bf", "0",
        "-g", String(VIDEO_FPS * seconds),
        "-an",
        "-y", join(dir, name),
      ]);
    const middle = total - 2;
    const long = Math.floor(middle / 5);
    const short = middle % 5;
    await Promise.all([
      encodeSegment("in.mp4", 1, `fade=t=in:st=0:d=${FADES.videoIn}`),
      encodeSegment("out.mp4", 1, `fade=t=out:st=${1 - FADES.videoOut}:d=${FADES.videoOut}`),
      short > 0 ? encodeSegment("still1.mp4", 1, "") : null,
      long > 0 ? encodeSegment("still5.mp4", 5, "") : null,
    ]);
    const list = [
      "in.mp4",
      ...Array<string>(long).fill("still5.mp4"),
      ...Array<string>(short).fill("still1.mp4"),
      "out.mp4",
    ];
    const listPath = join(dir, "list.txt");
    await writeFile(listPath, list.map((f) => `file '${f}'`).join("\n"));

    const d = String(total);
    // apad : si la musique est plus courte que la vidéo, on complète par du silence.
    const audioFilter = [
      `afade=t=in:st=0:d=${FADES.audioIn}`,
      `afade=t=out:st=${total - FADES.audioOut}:d=${FADES.audioOut}`,
      "apad",
    ].join(",");

    await run(ffmpegPath, [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "concat",
      "-safe", "0",
      "-i", listPath,
      "-ss", start.toFixed(3),
      "-t", d,
      "-i", musicPath,
      "-map", "0:v",
      "-map", "1:a",
      "-af", audioFilter,
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "44100",
      "-ac", "2",
      "-t", d,
      "-movflags", "+faststart",
      "-y", outPath,
    ]);

    await pngToJpeg(ffmpeg, framePath, coverPath);
    return { mp4: await readFile(outPath), cover: await readFile(coverPath) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
