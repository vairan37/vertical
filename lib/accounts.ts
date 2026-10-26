import { eq } from "drizzle-orm";
import { decrypt, encrypt } from "./crypto";
import { getDb, socialAccounts } from "./db";
import type { Platform } from "./db";
import { getProvider, isDryRun, isSimulated, SocialError, type Tokens } from "./social";

/** Ce qu'on peut afficher d'un compte connecté (jamais les tokens). */
export type AccountInfo = {
  platform: Platform;
  accountId: string;
  accountName: string | null;
  /** Date limite de la connexion : fin du token de renouvellement (TikTok) ou du token (Instagram). */
  validUntil: Date | null;
  /** La connexion a expiré : il faut se reconnecter. */
  expired: boolean;
  simulated: boolean;
};

export async function listAccounts(): Promise<Partial<Record<Platform, AccountInfo>>> {
  const rows = await getDb()
    .select({
      platform: socialAccounts.platform,
      accountId: socialAccounts.accountId,
      accountName: socialAccounts.accountName,
      expiresAt: socialAccounts.expiresAt,
      refreshExpiresAt: socialAccounts.refreshExpiresAt,
    })
    .from(socialAccounts);
  const now = Date.now();
  return Object.fromEntries(
    rows.map((r) => {
      const validUntil = r.refreshExpiresAt ?? r.expiresAt;
      return [
        r.platform,
        {
          platform: r.platform,
          accountId: r.accountId,
          accountName: r.accountName,
          validUntil,
          expired: validUntil ? validUntil.getTime() < now : false,
          simulated: isSimulated(r.accountId),
        },
      ];
    }),
  );
}

/** Enregistre (ou remplace) le compte d'une plateforme, tokens chiffrés. */
export async function saveAccount(platform: Platform, tokens: Tokens) {
  const values = {
    accountId: tokens.accountId,
    accountName: tokens.accountName,
    accessTokenEnc: encrypt(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt,
    refreshExpiresAt: tokens.refreshExpiresAt,
    updatedAt: new Date(),
  };
  await getDb()
    .insert(socialAccounts)
    .values({ platform, ...values })
    .onConflictDoUpdate({ target: socialAccounts.platform, set: values });
}

/** Tokens utilisables pour publier : déchiffrés, renouvelés si besoin (et réenregistrés). */
export async function getTokens(platform: Platform): Promise<Tokens> {
  const [row] = await getDb().select().from(socialAccounts).where(eq(socialAccounts.platform, platform));
  const label = platform === "instagram" ? "Instagram" : "TikTok";
  if (!row) throw new SocialError(`Compte ${label} non connecté : connecte-le dans la page Publiées.`);
  if (isSimulated(row.accountId) !== isDryRun()) {
    throw new SocialError(
      isDryRun()
        ? `Le compte ${label} est un vrai compte, mais le site est en simulation : reconnecte-le pour tester.`
        : `Le compte ${label} a été connecté en simulation : reconnecte-le pour publier pour de vrai.`,
    );
  }
  const tokens: Tokens = {
    accountId: row.accountId,
    accountName: row.accountName,
    accessToken: decrypt(row.accessTokenEnc),
    refreshToken: row.refreshTokenEnc ? decrypt(row.refreshTokenEnc) : null,
    expiresAt: row.expiresAt,
    refreshExpiresAt: row.refreshExpiresAt,
  };
  const fresh = await getProvider(platform).refresh(tokens, row.updatedAt);
  if (!fresh) return tokens;
  await saveAccount(platform, fresh);
  return fresh;
}
