/*
 * Réglages d'une template, partagés entre le serveur (rendu, validation) et l'éditeur (client).
 * Ce fichier ne doit rien importer de spécifique au serveur.
 */

export const FONTS = {
  montserrat: { label: "Montserrat (gras)", file: "Montserrat-ExtraBold.ttf", weight: 800, lineHeight: 1.15 },
  poppins: { label: "Poppins (gras)", file: "Poppins-Bold.ttf", weight: 700, lineHeight: 1.2 },
  bebas: { label: "Bebas Neue", file: "BebasNeue-Regular.ttf", weight: 400, lineHeight: 1.05 },
  anton: { label: "Anton", file: "Anton-Regular.ttf", weight: 400, lineHeight: 1.15 },
  abril: { label: "Abril Fatface", file: "AbrilFatface-Regular.ttf", weight: 400, lineHeight: 1.15 },
  marker: { label: "Permanent Marker", file: "PermanentMarker-Regular.ttf", weight: 400, lineHeight: 1.25 },
  pacifico: { label: "Pacifico", file: "Pacifico-Regular.ttf", weight: 400, lineHeight: 1.35 },
} as const;

export type FontId = keyof typeof FONTS;

export const IMAGE_FITS = {
  cover: { label: "Remplir l'écran", hint: "L'image est recadrée pour remplir le cadre 9:16." },
  width: { label: "Pleine largeur", hint: "Toute la largeur : une photo en paysage laisse des bandes en haut et en bas." },
  height: { label: "Pleine hauteur", hint: "Toute la hauteur : une photo étroite laisse des bandes sur les côtés, une photo large est rognée." },
} as const;

export type ImageFit = keyof typeof IMAGE_FITS;

export type TemplateSettings = {
  /** Centre vertical du texte, en % de la hauteur (0 = haut, 100 = bas). */
  textY: number;
  /** Taille de base du texte en px (réduite automatiquement pour les textes longs). */
  textSize: number;
  textColor: string;
  font: FontId;
  /** Cadrage : remplir (recadrage), pleine largeur ou pleine hauteur (bandes possibles). */
  imageFit: ImageFit;
  /** Centre vertical de l'image, en %. */
  imageY: number;
  /** Taille de l'image en % (100 = toute la largeur, la hauteur ou l'écran selon le cadrage). */
  imageScale: number;
  /** Couleur des bandes, visibles quand l'image ne remplit pas l'écran. */
  backgroundColor: string;
  /** Dégradé sombre par-dessus l'image, pour la lisibilité du texte. */
  darken: boolean;
};

/** Le look d'origine. */
export const DEFAULT_SETTINGS: TemplateSettings = {
  textY: 45,
  textSize: 104,
  textColor: "#ffffff",
  font: "montserrat",
  imageFit: "cover",
  imageY: 50,
  imageScale: 100,
  backgroundColor: "#000000",
  darken: true,
};

export const LIMITS = {
  textY: { min: 10, max: 90 },
  textSize: { min: 40, max: 160 },
  imageY: { min: 0, max: 100 },
  imageScale: { min: 30, max: 100 },
} as const;

const HEX = /^#[0-9a-f]{6}$/i;

function num(value: unknown, key: keyof typeof LIMITS): number {
  const n = Number(value);
  const { min, max } = LIMITS[key];
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS[key];
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Valide et normalise des réglages venant de l'extérieur (formulaire, base, URL). */
export function parseSettings(input: unknown): TemplateSettings {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const color = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fallback);
  return {
    textY: num(o.textY, "textY"),
    textSize: num(o.textSize, "textSize"),
    textColor: color(o.textColor, DEFAULT_SETTINGS.textColor),
    font: typeof o.font === "string" && o.font in FONTS ? (o.font as FontId) : DEFAULT_SETTINGS.font,
    imageFit: typeof o.imageFit === "string" && o.imageFit in IMAGE_FITS ? (o.imageFit as ImageFit) : DEFAULT_SETTINGS.imageFit,
    imageY: num(o.imageY, "imageY"),
    imageScale: num(o.imageScale, "imageScale"),
    backgroundColor: color(o.backgroundColor, DEFAULT_SETTINGS.backgroundColor),
    darken: o.darken === undefined ? DEFAULT_SETTINGS.darken : o.darken === true || o.darken === "true" || o.darken === "on",
  };
}
