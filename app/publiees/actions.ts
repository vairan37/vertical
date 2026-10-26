"use server";

import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { getDb, socialAccounts } from "@/lib/db";
import type { Platform } from "@/lib/db";
import { saveTikTokSettings as saveSettings } from "@/lib/publish-settings";
import { parseTikTokOptions } from "@/lib/tiktok-options";

/** Déconnecte un compte : supprime ses tokens de la base (rien n'est supprimé sur le réseau). */
export async function disconnectAccount(platform: Platform) {
  await requireAuth();
  if (platform !== "instagram" && platform !== "tiktok") throw new Error("Plateforme inconnue.");
  await getDb().delete(socialAccounts).where(eq(socialAccounts.platform, platform));
  refresh();
}

/** Enregistre les réglages de publication TikTok (visibilité, interactions). Renvoie une erreur ou null. */
export async function saveTikTokSettings(input: unknown): Promise<string | null> {
  await requireAuth();
  const settings = parseTikTokOptions(input);
  if (!settings?.privacyLevel) return "Choisis qui peut voir tes vidéos.";
  await saveSettings(settings);
  refresh();
  return null;
}
