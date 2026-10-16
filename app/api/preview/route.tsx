import { readSourceImage } from "@/lib/source-image";
import { MAX_TEXT_LENGTH, renderFrame } from "@/lib/template";
import { resolveTemplate } from "@/lib/templates";
import { frameToJpeg } from "@/lib/video";

export const maxDuration = 30;

/**
 * Aperçu exact de la vidéo (même rendu que /api/render) : POST multipart { image?, text, templateId }
 * -> JPEG 540x960. Sans image, un emplacement coloré la remplace.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }
  const hasImage = form.get("image") instanceof File;
  const source = hasImage ? await readSourceImage(form.get("image")) : null;
  if (source && "error" in source) return Response.json({ error: source.error }, { status: 400 });

  const text = String(form.get("text") ?? "").trim().slice(0, MAX_TEXT_LENGTH);
  try {
    const template = await resolveTemplate(String(form.get("templateId") ?? "") || null);
    const jpeg = await frameToJpeg(await renderFrame(source ? source.image : null, text, template.settings));
    return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Aperçu impossible", error);
    return Response.json({ error: "L'aperçu n'a pas pu être généré." }, { status: 500 });
  }
}
