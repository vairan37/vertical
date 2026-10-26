import { eq } from "drizzle-orm";
import { getDb, publishSettings } from "./db";
import { EMPTY_TIKTOK_OPTIONS, parseTikTokOptions, type TikTokOptions } from "./tiktok-options";

/**
 * Réglages TikTok choisis dans « Publiées » : visibilité et interactions. La déclaration de contenu
 * commercial n'en fait pas partie : elle dépend de chaque vidéo (cochée au cas par cas).
 */
export async function getTikTokSettings(): Promise<TikTokOptions | null> {
  const [row] = await getDb().select().from(publishSettings).where(eq(publishSettings.platform, "tiktok"));
  return row ? onlyAccountSettings(parseTikTokOptions(row.settings)) : null;
}

export async function saveTikTokSettings(settings: TikTokOptions): Promise<void> {
  const value = onlyAccountSettings(settings);
  await getDb()
    .insert(publishSettings)
    .values({ platform: "tiktok", settings: value })
    .onConflictDoUpdate({ target: publishSettings.platform, set: { settings: value, updatedAt: new Date() } });
}

function onlyAccountSettings(o: TikTokOptions | null): TikTokOptions {
  return {
    ...EMPTY_TIKTOK_OPTIONS,
    privacyLevel: o?.privacyLevel ?? "",
    allowComment: o?.allowComment ?? false,
    allowDuet: o?.allowDuet ?? false,
    allowStitch: o?.allowStitch ?? false,
  };
}
