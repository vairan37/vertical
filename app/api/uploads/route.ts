import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { MAX_CLIP_BYTES, saveFile, usesVercelBlob } from "@/lib/storage";

const CLIP_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const PATHNAME = /^sources\/[A-Za-z0-9_-]+\.(mp4|mov|webm)$/;

/**
 * Envoi d'un clip vidéo (trop lourd pour passer par une requête Vercel, limitée à ~4,5 Mo).
 * - Vercel Blob : le navigateur envoie directement le fichier à Blob avec une URL présignée,
 *   délivrée ici (handleUploadPresigned + issueSignedToken, compatible avec la connexion OIDC).
 * - En local sans Blob : envoi multipart classique, enregistré sur le disque.
 */
export async function POST(request: Request) {
  if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    if (usesVercelBlob()) return Response.json({ error: "Envoi direct requis." }, { status: 400 });
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || !CLIP_TYPES.includes(file.type)) {
      return Response.json({ error: "Envoie une vidéo MP4, MOV ou WebM." }, { status: 400 });
    }
    const ext = file.type === "video/quicktime" ? "mov" : file.type === "video/webm" ? "webm" : "mp4";
    const saved = await saveFile(`sources/${crypto.randomUUID()}.${ext}`, Buffer.from(await file.arrayBuffer()), file.type);
    return Response.json({ url: saved.url });
  }

  try {
    const body = (await request.json()) as HandleUploadPresignedBody;
    const result = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname) => {
        if (!PATHNAME.test(pathname)) throw new Error("Nom de fichier refusé.");
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: CLIP_TYPES,
          maximumSizeInBytes: MAX_CLIP_BYTES,
          validUntil: Date.now() + 30 * 60 * 1000,
        });
        return { token, urlOptions: { addRandomSuffix: true, allowedContentTypes: CLIP_TYPES, maximumSizeInBytes: MAX_CLIP_BYTES } };
      },
    });
    return Response.json(result);
  } catch (error) {
    console.error("Préparation de l'envoi impossible", error);
    return Response.json(
      { error: error instanceof Error ? `Envoi impossible : ${error.message}` : "Envoi impossible." },
      { status: 400 },
    );
  }
}
