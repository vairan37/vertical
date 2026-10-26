import type { Platform } from "../db";

/** Tokens d'un compte (en clair, uniquement en mémoire : chiffrés avant la base). */
export type Tokens = {
  accountId: string;
  accountName: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  refreshExpiresAt: Date | null;
};

export type PublishInput = {
  /** URL publique du MP4 (Vercel Blob). */
  videoUrl: string;
  /** Couverture JPEG publique, si elle existe. */
  coverUrl: string | null;
  /** Légende (Instagram ; TikTok en brouillon : la légende s'écrit dans l'appli). */
  caption: string;
};

export type PublishState =
  | {
      state: "processing";
      /** true : la plateforme traite encore la vidéo, on revérifie bientôt. false : on attend Victor (brouillon TikTok). */
      waiting: boolean;
      externalId?: string;
    }
  | { state: "published"; externalId?: string; url: string | null }
  | { state: "failed"; error: string };

/**
 * Tout appel à Instagram ou TikTok passe par cette interface. Deux implémentations par réseau :
 * la vraie (lib/social/instagram.ts, tiktok.ts) et la simulation (simulation.ts, DRY_RUN).
 */
export interface SocialProvider {
  platform: Platform;
  /** URL de la page d'autorisation du réseau. */
  authorizeUrl(redirectUri: string, state: string): string;
  /** Échange le code reçu au retour de l'autorisation contre des tokens. */
  exchangeCode(code: string, redirectUri: string): Promise<Tokens>;
  /** Renouvelle les tokens si besoin ; null si rien à faire. `savedAt` : date du dernier enregistrement. */
  refresh(tokens: Tokens, savedAt: Date): Promise<Tokens | null>;
  /** Lance la publication ; renvoie l'identifiant à suivre (conteneur Instagram, publish_id TikTok). */
  start(input: PublishInput, tokens: Tokens): Promise<string>;
  /** Où en est la publication. Pour Instagram, publie le conteneur quand il est prêt. */
  check(externalId: string, tokens: Tokens): Promise<PublishState>;
}

/** Erreur affichable telle quelle à Victor (en français). */
export class SocialError extends Error {}

/** Lit une réponse JSON sans planter si le corps n'en est pas. */
export async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}
