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
  return sourceImageFromBuffer(Buffer.from(await value.arrayBuffer()));
}

/** Même préparation à partir d'octets (image de la bibliothèque) ; le type est lu dans le fichier. */
export function sourceImageFromBuffer(buffer: Buffer): { image: SourceImage; buffer: Buffer; type: string } | { error: string } {
  const type = buffer[0] === 0x89 && buffer[1] === 0x50 ? "image/png" : "image/jpeg";
  const size = imageSize(buffer);
  if (!size || size.width === 0 || size.height === 0) {
    return { error: "L'image n'a pas pu être lue (JPEG ou PNG attendu)." };
  }
  return { image: { dataUrl: `data:${type};base64,${buffer.toString("base64")}`, ...size }, buffer, type };
}

export { MAX_IMAGE_BYTES };
