import type { Platform } from "../db";
import type { SocialProvider } from "./types";

/*
 * Simulation (DRY_RUN) : aucun appel réseau. Journalise ce qui serait envoyé et renvoie de faux
 * identifiants, préfixés « sim_ ». La « page d'autorisation » renvoie directement au callback.
 */

const LABEL: Record<Platform, string> = { instagram: "Instagram", tiktok: "TikTok" };

export function simulation(platform: Platform): SocialProvider {
  const log = (what: string, data: unknown) => console.log(`[DRY_RUN] ${LABEL[platform]} : ${what}`, JSON.stringify(data));
  return {
    platform,
    authorizeUrl(redirectUri, state) {
      log("autorisation demandée", { redirectUri });
      return `${redirectUri}?${new URLSearchParams({ code: "simulation", state })}`;
    },
    async exchangeCode() {
      log("connexion simulée", {});
      return {
        accountId: `sim_${platform}`,
        accountName: `Compte simulé ${LABEL[platform]}`,
        accessToken: "sim_token",
        refreshToken: null,
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        refreshExpiresAt: null,
      };
    },
    async refresh() {
      return null;
    },
    async start(input) {
      log("publierait", { ...input, mode: platform === "tiktok" ? "brouillon (inbox)" : "Reel" });
      return `sim_${crypto.randomUUID()}`;
    },
    async check(externalId) {
      log("suivi", { externalId });
      return { state: "published", url: null };
    },
  };
}
