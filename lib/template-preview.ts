import type { TemplateSettings } from "./template-settings";

export const SAMPLE_TEXT = "Ton texte ici, sur une ou deux lignes";
export const SAMPLE_AUTHOR = "Nom de l'artiste";

/** URL de l'aperçu PNG d'une template (route /api/templates/preview). */
export function previewUrl(settings: TemplateSettings, text = SAMPLE_TEXT, author = SAMPLE_AUTHOR) {
  return `/api/templates/preview?s=${encodeURIComponent(JSON.stringify(settings))}&text=${encodeURIComponent(text)}&author=${encodeURIComponent(author)}`;
}
