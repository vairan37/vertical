import { denyUnauthenticated } from "@/lib/auth";
import { listLibrary } from "@/lib/image-library";

/** GET : la bibliothèque d'images (la dernière utilisée en premier). */
export async function GET() {
  const denied = await denyUnauthenticated();
  if (denied) return denied;
  try {
    return Response.json({ images: await listLibrary() });
  } catch (error) {
    console.error("Lecture de la bibliothèque impossible", error);
    return Response.json({ error: "Impossible de lire la bibliothèque d'images." }, { status: 500 });
  }
}
