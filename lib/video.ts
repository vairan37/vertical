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

/** Assemble l'image et la musique en MP4 (H.264 + AAC, 1080x1920, 30 fps). */
export async function renderVideo({ framePng, music, start, duration }: RenderOptions): Promise<Buffer> {
  if (!ffmpegPath) throw new RenderError("ffmpeg est introuvable sur le serveur.");

  const dir = await mkdtemp(join(tmpdir(), "vertical-"));
  try {
    const framePath = join(dir, "frame.png");
    const outPath = join(dir, "video.mp4");
    await writeFile(framePath, framePng);

    let musicPath: string;
    if ("path" in music) {
      musicPath = music.path;
    } else {
      musicPath = join(dir, "music");
      await writeFile(musicPath, music.data);
    }

    const d = duration.toFixed(3);
    const videoFilter = [
      `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}`,
      "format=yuv420p",
      `fade=t=in:st=0:d=${FADES.videoIn}`,
      `fade=t=out:st=${(duration - FADES.videoOut).toFixed(3)}:d=${FADES.videoOut}`,
    ].join(",");
    // apad : si la musique est plus courte que la vidéo, on complète par du silence.
    const audioFilter = [
      `afade=t=in:st=0:d=${FADES.audioIn}`,
      `afade=t=out:st=${(duration - FADES.audioOut).toFixed(3)}:d=${FADES.audioOut}`,
      "apad",
    ].join(",");

    await run(ffmpegPath, [
      "-hide_banner",
      "-loglevel", "error",
      "-loop", "1",
      "-framerate", String(VIDEO_FPS),
      "-i", framePath,
      "-ss", start.toFixed(3),
      "-t", d,
      "-i", musicPath,
      "-filter_complex", `[0:v]${videoFilter}[v];[1:a]${audioFilter}[a]`,
      "-map", "[v]",
      "-map", "[a]",
      "-t", d,
      "-r", String(VIDEO_FPS),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-tune", "stillimage",
      "-profile:v", "high",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "44100",
      "-ac", "2",
      "-movflags", "+faststart",
      "-y", outPath,
    ]);

    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
