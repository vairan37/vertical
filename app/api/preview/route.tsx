import { denyUnauthenticated } from "@/lib/auth";
import { readLibraryImage } from "@/lib/image-library";
import { readSourceImage } from "@/lib/source-image";
import { MAX_AUTHOR_LENGTH, MAX_TEXT_LENGTH, renderFrame } from "@/lib/template";
import { resolveTemplate } from "@/lib/templates";
import { frameToJpeg } from "@/lib/video";
import { UUID } from "@/lib/videos";

export const maxDuration = 30;

/**
 * Aperçu exact de la vidéo (même rendu que /api/render) : POST multipart { image? | imageId?, text, templateId }
 * -> JPEG 540x960. Sans image, un emplacement coloré la remplace.
 */
export async function POST(request: Request) {
  const denied = await denyUnauthenticated();
  if (denied) return denied;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }
  // Photo envoyée, ou image de la bibliothèque (imageId).
  const imageId = String(form.get("imageId") ?? "");
  const source = UUID.test(imageId)
    ? await readLibraryImage(imageId, false)
    : form.get("image") instanceof File
      ? await readSourceImage(form.get("image"))
      : null;
  if (source && "error" in source) return Response.json({ error: source.error }, { status: 400 });

  const text = String(form.get("text") ?? "").trim().slice(0, MAX_TEXT_LENGTH);
  const author = String(form.get("author") ?? "").trim().slice(0, MAX_AUTHOR_LENGTH);
  try {
    const template = await resolveTemplate(String(form.get("templateId") ?? "") || null);
    // Calque seul (dégradé + texte, fond transparent) : l'aperçu animé d'un clip le superpose
    // lui-même au clip qui joue. PNG pour garder la transparence.
    if (form.get("layer") === "overlay") {
      const png = await renderFrame(null, text, template.settings, { overlayOnly: true, author });
      return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
    }
    // Pour un clip, l'image envoyée est une image du clip : pas de coins arrondis (comme le rendu).
    const rounded = form.get("media") !== "clip";
    const jpeg = await frameToJpeg(await renderFrame(source ? source.image : null, text, template.settings, { rounded, author }));
    return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Aperçu impossible", error);
    return Response.json({ error: "L'aperçu n'a pas pu être généré." }, { status: 500 });
  }
}
