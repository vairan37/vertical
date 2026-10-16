import { getDb, socialAccounts } from "./db";
import type { Platform } from "./db";

/** Ce qu'on peut afficher d'un compte connecté (jamais les tokens). */
export type AccountInfo = {
  platform: Platform;
  accountId: string;
  accountName: string | null;
  expiresAt: Date | null;
  /** Le token d'accès a expiré (il faudra se reconnecter si le renouvellement a échoué). */
  expired: boolean;
};

export async function listAccounts(): Promise<Partial<Record<Platform, AccountInfo>>> {
  const rows = await getDb()
    .select({
      platform: socialAccounts.platform,
      accountId: socialAccounts.accountId,
      accountName: socialAccounts.accountName,
      expiresAt: socialAccounts.expiresAt,
    })
    .from(socialAccounts);
  const now = Date.now();
  return Object.fromEntries(
    rows.map((r) => [r.platform, { ...r, expired: r.expiresAt ? r.expiresAt.getTime() < now : false }]),
  );
}
