/*
 * Options d'une publication directe TikTok, partagées client/serveur. Elles suivent les règles
 * d'interface de TikTok (developers.tiktok.com/doc/content-sharing-guidelines), vérifiées à
 * l'audit : visibilité choisie sans valeur par défaut parmi celles du compte, interactions décochées
 * par défaut, déclaration de contenu commercial, accord sur l'utilisation de la musique.
 */

export const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Tout le monde",
  MUTUAL_FOLLOW_FRIENDS: "Amis",
  FOLLOWER_OF_CREATOR: "Abonnés",
  SELF_ONLY: "Moi uniquement",
};

export type TikTokOptions = {
  /** Vide tant que Victor n'a pas choisi (pas de valeur par défaut, exigence TikTok). */
  privacyLevel: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  /** Déclaration de contenu commercial. */
  disclose: boolean;
  /** « Ta marque » : contenu qui fait ta propre promotion. */
  yourBrand: boolean;
  /** « Contenu de marque » : partenariat rémunéré avec un tiers. */
  brandedContent: boolean;
};

export const EMPTY_TIKTOK_OPTIONS: TikTokOptions = {
  privacyLevel: "",
  allowComment: false,
  allowDuet: false,
  allowStitch: false,
  disclose: false,
  yourBrand: false,
  brandedContent: false,
};

/** Infos du compte TikTok, à relire à chaque écran de publication (exigence TikTok). */
export type CreatorInfo = {
  nickname: string;
  username: string | null;
  avatarUrl: string | null;
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxDurationSec: number;
};

export const MUSIC_USAGE_URL = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
export const BRANDED_CONTENT_URL = "https://www.tiktok.com/legal/page/global/bc-policy/en";

export function parseTikTokOptions(input: unknown): TikTokOptions | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  return {
    privacyLevel: typeof o.privacyLevel === "string" && o.privacyLevel in PRIVACY_LABELS ? o.privacyLevel : "",
    allowComment: o.allowComment === true,
    allowDuet: o.allowDuet === true,
    allowStitch: o.allowStitch === true,
    disclose: o.disclose === true,
    yourBrand: o.yourBrand === true,
    brandedContent: o.brandedContent === true,
  };
}

/** Variante pour un champ de formulaire en JSON (texte invalide = pas d'options). */
export function parseTikTokOptionsJson(text: string): TikTokOptions | null {
  try {
    return parseTikTokOptions(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Ce qui empêche de publier, ou null. `creator` : infos du compte quand elles sont connues. */
export function tiktokOptionsError(o: TikTokOptions | null, creator?: CreatorInfo | null, duration?: number): string | null {
  if (!o?.privacyLevel) return "Choisis qui peut voir la vidéo sur TikTok.";
  if (creator && !creator.privacyOptions.includes(o.privacyLevel)) {
    return "Cette visibilité n'est pas disponible pour ton compte TikTok : choisis-en une autre.";
  }
  if (o.disclose && !o.yourBrand && !o.brandedContent) {
    return "Indique si la vidéo fait ta promotion, celle d'un tiers, ou les deux.";
  }
  if (o.disclose && o.brandedContent && o.privacyLevel === "SELF_ONLY") {
    return "Un contenu de marque ne peut pas être en « Moi uniquement ».";
  }
  if (creator && duration && duration > creator.maxDurationSec) {
    return `TikTok accepte ${creator.maxDurationSec} s maximum pour ton compte.`;
  }
  return null;
}

/** Libellé affiché par TikTok selon la déclaration commerciale. */
export function disclosureLabel(o: TikTokOptions): string | null {
  if (!o.disclose) return null;
  if (o.brandedContent) return "La vidéo sera marquée « Partenariat rémunéré ».";
  if (o.yourBrand) return "La vidéo sera marquée « Contenu promotionnel ».";
  return null;
}
