import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { FADES, imageBox, VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from "./template";
import type { TemplateSettings } from "./template-settings";

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

function run(bin: string, args: string[], timeout = 50_000): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (error, _stdout, stderr) => {
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

export type ClipInfo = { width: number; height: number; duration: number };

/**
 * Dimensions (après rotation : les vidéos de téléphone sont souvent stockées couchées avec une
 * consigne de rotation) et durée d'un clip, lues dans la sortie de « ffmpeg -i » (pas de ffprobe).
 */
export async function probeVideo(path: string): Promise<ClipInfo> {
  if (!ffmpegPath) throw new RenderError("ffmpeg est introuvable sur le serveur.");
  const bin = ffmpegPath;
  const stderr = await new Promise<string>((resolve) => {
    execFile(bin, ["-hide_banner", "-i", path], { timeout: 20_000 }, (_error, _stdout, err) => resolve(String(err)));
  });
  const stream = stderr.match(/Stream #\S+.*Video: .*?(\d{2,5})x(\d{2,5})/);
  const time = stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!stream) throw new RenderError("Ce fichier n'est pas une vidéo lisible.");
  let width = Number(stream[1]);
  let height = Number(stream[2]);
  const rotation = stderr.match(/rotation of (-?\d+(?:\.\d+)?) degrees/);
  if (rotation && Math.abs(Math.round(Number(rotation[1]))) % 180 === 90) [width, height] = [height, width];
  const duration = time ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) : 0;
  return { width, height, duration };
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

type ClipOptions = {
  clipPath: string;
  clip: ClipInfo;
  /** Calque PNG transparent (dégradé + texte) rendu par renderFrame({ overlayOnly: true }). */
  overlayPng: Buffer;
  settings: TemplateSettings;
  music: RenderOptions["music"];
  start: number;
  duration: number;
};

/**
 * Vidéo à partir d'un clip : fond de la couleur de la template, clip cadré comme une photo
 * (même calcul que imageBox), calque texte par-dessus, musique de la vidéo finale. Le clip est
 * rejoué en boucle s'il est plus court que la durée demandée ; son propre son est ignoré.
 * Couverture : la frame à 1 s.
 */
export async function renderClip({ clipPath, clip, overlayPng, settings, music, start, duration }: ClipOptions) {
  if (!ffmpegPath) throw new RenderError("ffmpeg est introuvable sur le serveur.");
  const dir = await mkdtemp(join(tmpdir(), "vertical-"));
  try {
    const overlayPath = join(dir, "overlay.png");
    const outPath = join(dir, "video.mp4");
    const coverPath = join(dir, "cover.jpg");
    await writeFile(overlayPath, overlayPng);
    let musicPath: string;
    if ("path" in music) musicPath = music.path;
    else {
      musicPath = join(dir, "music");
      await writeFile(musicPath, music.data);
    }

    const total = Math.round(duration);
    const box = imageBox(settings, clip.width / clip.height);
    const w = even(box.width);
    const h = even(box.height);
    // Tout en YUV : le calque PNG n'est décodé et converti qu'une fois (overlay réutilise sa
    // dernière image), ce qui divise presque par deux le temps de calcul.
    const filter = [
      `color=c=${settings.backgroundColor}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:r=${VIDEO_FPS}:d=${total},format=yuv420p[bg]`,
      // Cadrage « remplir » dans la boîte : mise à l'échelle par excès puis recadrage au centre.
      `[0:v]fps=${VIDEO_FPS},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,format=yuv420p[clip]`,
      `[1:v]format=yuva420p[ov]`,
      `[bg][clip]overlay=${box.left}:${box.top}:eof_action=pass:format=yuv420[base]`,
      `[base][ov]overlay=0:0:format=yuv420,` +
        `fade=t=in:st=0:d=${FADES.videoIn},fade=t=out:st=${total - FADES.videoOut}:d=${FADES.videoOut}[v]`,
      `[2:a]afade=t=in:st=0:d=${FADES.audioIn},afade=t=out:st=${total - FADES.audioOut}:d=${FADES.audioOut},apad[a]`,
    ].join(";");

    await run(
      ffmpegPath,
      [
        "-hide_banner", "-loglevel", "error",
        "-stream_loop", "-1",
        "-i", clipPath,
        "-i", overlayPath,
        "-ss", start.toFixed(3),
        "-t", String(total),
        "-i", musicPath,
        "-filter_complex", filter,
        "-map", "[v]",
        "-map", "[a]",
        "-t", String(total),
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        "-g", String(VIDEO_FPS * 2),
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", "44100",
        "-ac", "2",
        "-movflags", "+faststart",
        "-y", outPath,
      ],
      280_000,
    );
    await run(ffmpegPath, [
      "-hide_banner", "-loglevel", "error",
      "-ss", String(Math.min(1, total / 2)),
      "-i", outPath,
      "-frames:v", "1",
      "-vf", `scale=${VIDEO_WIDTH / 2}:${VIDEO_HEIGHT / 2}`,
      "-q:v", "4",
      "-y", coverPath,
    ]);
    return { mp4: await readFile(outPath), cover: await readFile(coverPath) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
