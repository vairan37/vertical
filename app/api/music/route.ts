import { listMusic } from "@/lib/music";

export async function GET() {
  return Response.json({ music: await listMusic() });
}
