import { imageSize } from "./image-size";
import type { SourceImage } from "./template";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png"];

/**
 * Valide la photo envoyée (champ « image » d'un formulaire) et la prépare pour renderFrame.
 * Renvoie un message d'erreur en français si elle est absente ou illisible.
 */
export async function readSourceImage(
  value: FormDataEntryValue | null,
): Promise<{ image: SourceImage; buffer: Buffer; type: string } | { error: string }> {
  if (!(value instanceof File) || value.size === 0) return { error: "Choisis une image." };
  if (!IMAGE_TYPES.includes(value.type)) return { error: "L'image doit être au format JPEG ou PNG." };
  if (value.size > MAX_IMAGE_BYTES) return { error: "L'image est trop lourde (4 Mo maximum)." };
  const buffer = Buffer.from(await value.arrayBuffer());
  const size = imageSize(buffer);
  if (!size || size.width === 0 || size.height === 0) {
    return { error: "L'image n'a pas pu être lue (JPEG ou PNG attendu)." };
  }
  return { image: { dataUrl: `data:${value.type};base64,${buffer.toString("base64")}`, ...size }, buffer, type: value.type };
}
