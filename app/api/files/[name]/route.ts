import { readLocalFile } from "@/lib/storage";

const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  gif: "image/gif",
  jpg: "image/jpeg",
  png: "image/png",
};

/** Sert les fichiers du stockage local (développement sans Vercel Blob). */
export async function GET(request: Request, ctx: RouteContext<"/api/files/[name]">) {
  const { name } = await ctx.params;
  const data = await readLocalFile(name);
  if (!data) return new Response("Fichier introuvable", { status: 404 });
  const download = new URL(request.url).searchParams.has("download");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": TYPES[name.split(".").pop() ?? ""] ?? "application/octet-stream",
      ...(download ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
    },
  });
}
