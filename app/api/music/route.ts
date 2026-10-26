import { denyUnauthenticated } from "@/lib/auth";
import { listMusic } from "@/lib/music";

export async function GET() {
  const denied = await denyUnauthenticated();
  if (denied) return denied;
  return Response.json({ music: await listMusic() });
}
