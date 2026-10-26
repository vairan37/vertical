import type { Platform } from "./db";

/** Cookie qui garde l'anti-CSRF « state » entre le départ vers le réseau et le retour. */
export const OAUTH_STATE_COOKIE = "vertical_oauth_state";

export function parsePlatform(value: string): Platform | null {
  return value === "instagram" || value === "tiktok" ? value : null;
}

/**
 * Adresse de retour, à déclarer à l'identique dans les apps Meta et TikTok :
 * <APP_URL ou origine du site>/api/social/<plateforme>/callback.
 */
export function redirectUri(request: Request, platform: Platform) {
  const origin = process.env.APP_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  return `${origin}/api/social/${platform}/callback`;
}
