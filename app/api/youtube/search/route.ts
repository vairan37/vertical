import { searchYoutube, YoutubeError } from "@/lib/youtube";

export const maxDuration = 30;

/** GET /api/youtube/search?q=… : 8 résultats (id, titre, chaîne, durée, miniature). */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return Response.json({ results: await searchYoutube(q) });
  } catch (error) {
    const message = error instanceof YoutubeError ? error.message : "La recherche YouTube a échoué.";
    return Response.json({ error: message }, { status: 502 });
  }
}
