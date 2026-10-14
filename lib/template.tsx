import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/*
 * Toute l'apparence de la template est ici : c'est l'unique fichier à modifier
 * pour changer le look des vidéos (cadrage, dégradé, police, texte, fondus).
 */

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;
export const MIN_DURATION = 3;
export const MAX_DURATION = 15;
export const MAX_TEXT_LENGTH = 300;

/** Fondus appliqués par ffmpeg, en secondes. */
export const FADES = {
  videoIn: 0.4,
  videoOut: 0.4,
  audioIn: 0.3,
  audioOut: 1,
};

const montserratExtraBold = await readFile(
  join(process.cwd(), "assets", "fonts", "Montserrat-ExtraBold.ttf"),
);

/** Taille du texte selon sa longueur, pour qu'il reste lisible et tienne à l'écran. */
function fontSizeFor(text: string): number {
  const n = text.length;
  if (n <= 30) return 104;
  if (n <= 70) return 84;
  if (n <= 140) return 68;
  if (n <= 220) return 56;
  return 48;
}

/**
 * Génère l'image (PNG 1080x1920) de la vidéo.
 * @param imageDataUrl image source en data URL (JPEG ou PNG)
 */
export async function renderFrame(imageDataUrl: string, text: string): Promise<Buffer> {
  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: "#000",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img
          src={imageDataUrl}
          width={VIDEO_WIDTH}
          height={VIDEO_HEIGHT}
          style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            backgroundImage:
              "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.7) 100%)",
          }}
        />
        {text ? (
          <div
            style={{
              position: "absolute",
              // Zone sûre : hors des barres d'interface d'Instagram et TikTok
              // (haut, bas et colonne de boutons à droite).
              top: 420,
              left: 90,
              right: 140,
              bottom: 620,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                textAlign: "center",
                color: "#fff",
                fontFamily: "Montserrat",
                fontWeight: 800,
                fontSize: fontSizeFor(text),
                lineHeight: 1.15,
                textShadow: "0 4px 24px rgba(0,0,0,0.6)",
                whiteSpace: "pre-wrap",
              }}
            >
              {text}
            </div>
          </div>
        ) : null}
      </div>
    ),
    {
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
      fonts: [{ name: "Montserrat", data: montserratExtraBold, weight: 800, style: "normal" }],
    },
  );
  return Buffer.from(await response.arrayBuffer());
}
