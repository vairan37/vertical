import type { TemplateSettings } from "./template-settings";

export const SAMPLE_TEXT = "Ton texte ici, sur une ou deux lignes";

/** URL de l'aperçu PNG d'une template (route /api/templates/preview). */
export function previewUrl(settings: TemplateSettings, text = SAMPLE_TEXT) {
  return `/api/templates/preview?s=${encodeURIComponent(JSON.stringify(settings))}&text=${encodeURIComponent(text)}`;
}
