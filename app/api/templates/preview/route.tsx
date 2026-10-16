import { parseSettings } from "@/lib/template-settings";
import { MAX_AUTHOR_LENGTH, MAX_TEXT_LENGTH, renderFrame } from "@/lib/template";

/**
 * Aperçu PNG d'une template : GET /api/templates/preview?s=<réglages JSON>&text=<texte>.
 * L'image est remplacée par un emplacement coloré.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let raw: unknown = {};
  try {
    raw = JSON.parse(params.get("s") ?? "{}");
  } catch {
    // réglages illisibles : valeurs par défaut
  }
  const text = (params.get("text") ?? "").slice(0, MAX_TEXT_LENGTH);
  const author = (params.get("author") ?? "").slice(0, MAX_AUTHOR_LENGTH);
  const png = await renderFrame(null, text, parseSettings(raw), { author });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, immutable" },
  });
}
