"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { getDb, socialAccounts } from "@/lib/db";
import type { Platform } from "@/lib/db";

/** Déconnecte un compte : supprime ses tokens de la base (rien n'est supprimé sur le réseau). */
export async function disconnectAccount(platform: Platform) {
  if (platform !== "instagram" && platform !== "tiktok") throw new Error("Plateforme inconnue.");
  await getDb().delete(socialAccounts).where(eq(socialAccounts.platform, platform));
  refresh();
}
