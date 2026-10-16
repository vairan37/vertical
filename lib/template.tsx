import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FONTS, type FontId, type TemplateSettings } from "./template-settings";

/*
 * Rendu d'une frame de vidéo à partir des réglages d'une template (lib/template-settings.ts).
 * Le look de base (dégradé, ombre du texte, zone sûre) est ici ; ce qui est réglable par
 * l'utilisateur (positions, tailles, police, fond) vient de TemplateSettings.
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

// Marges horizontales du texte : zone sûre hors de la colonne de boutons d'Instagram/TikTok à droite.
const TEXT_LEFT = 90;
const TEXT_RIGHT = 140;

const fontCache = new Map<FontId, Promise<Buffer>>();

/** Charge une police une seule fois (lecture paresseuse, puis mise en cache). */
function loadFont(id: FontId): Promise<Buffer> {
  let data = fontCache.get(id);
  if (!data) {
    data = readFile(join(process.cwd(), "assets", "fonts", FONTS[id].file));
    fontCache.set(id, data);
  }
  return data;
}

/** Taille du texte selon sa longueur : les textes longs sont réduits pour tenir à l'écran. */
function fontSizeFor(text: string, base: number): number {
  const n = text.length;
  const factor = n <= 30 ? 1 : n <= 70 ? 0.8 : n <= 140 ? 0.65 : n <= 220 ? 0.54 : 0.46;
  return Math.round(base * factor);
}

/**
 * Génère l'image (PNG 1080x1920) de la vidéo.
 * @param imageDataUrl image source en data URL (JPEG ou PNG), ou null pour un emplacement factice
 *                     (aperçu dans l'éditeur de templates)
 */
export async function renderFrame(
  imageDataUrl: string | null,
  text: string,
  settings: TemplateSettings,
): Promise<Buffer> {
  const font = FONTS[settings.font];
  const fontData = await loadFont(settings.font);

  // Boîte de l'image : au format 9:16, largeur = imageScale % de la vidéo, centrée horizontalement,
  // centre vertical à imageY %. À 100 %, l'image remplit tout l'écran.
  const imgW = Math.round((VIDEO_WIDTH * settings.imageScale) / 100);
  const imgH = Math.round((VIDEO_HEIGHT * settings.imageScale) / 100);
  const imgLeft = Math.round((VIDEO_WIDTH - imgW) / 2);
  const imgTop = Math.round((VIDEO_HEIGHT * settings.imageY) / 100 - imgH / 2);
  const fullBleed = settings.imageScale >= 100;

  // Bande du texte centrée sur textY % : le texte est centré verticalement dans cette bande.
  const half = Math.min(settings.textY, 100 - settings.textY);
  const textTop = Math.round((VIDEO_HEIGHT * (settings.textY - half)) / 100);
  const textHeight = Math.max(200, Math.round((VIDEO_HEIGHT * half * 2) / 100));

  const response = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: settings.backgroundColor,
        }}
      >
        {imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img
            src={imageDataUrl}
            width={imgW}
            height={imgH}
            style={{
              position: "absolute",
              top: fullBleed ? 0 : imgTop,
              left: fullBleed ? 0 : imgLeft,
              objectFit: "cover",
              borderRadius: fullBleed ? 0 : 32,
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              top: fullBleed ? 0 : imgTop,
              left: fullBleed ? 0 : imgLeft,
              width: imgW,
              height: imgH,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: fullBleed ? 0 : 32,
              backgroundImage: "linear-gradient(135deg, #6d28d9 0%, #db2777 50%, #f59e0b 100%)",
              color: "rgba(255,255,255,0.45)",
              fontSize: 72,
              fontFamily: "Template",
            }}
          >
            IMAGE
          </div>
        )}
        {settings.darken && (
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
        )}
        {text ? (
          <div
            style={{
              position: "absolute",
              top: textTop,
              height: textHeight,
              left: TEXT_LEFT,
              right: TEXT_RIGHT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                textAlign: "center",
                color: settings.textColor,
                fontFamily: "Template",
                fontWeight: font.weight,
                fontSize: fontSizeFor(text, settings.textSize),
                lineHeight: font.lineHeight,
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
      fonts: [{ name: "Template", data: fontData, weight: font.weight, style: "normal" }],
    },
  );
  return Buffer.from(await response.arrayBuffer());
}
