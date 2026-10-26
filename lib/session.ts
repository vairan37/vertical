import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

/*
 * Session de l'unique utilisateur : un cookie httpOnly signé (HMAC-SHA256) qui contient sa date
 * d'expiration. Aucune donnée en base, donc vérifiable dans proxy.ts sans requête.
 *
 * La clé de signature est dérivée de APP_PASSWORD (scrypt, lent à attaquer) : changer le mot de
 * passe déconnecte tous les appareils. Utilisé par proxy.ts et lib/auth.ts.
 */

export const SESSION_COOKIE = "vertical_session";
/** Durée d'une connexion : 60 jours (usage sur téléphone, on ne retape pas le mot de passe). */
export const SESSION_MAX_AGE = 60 * 24 * 60 * 60;

/** Sans APP_PASSWORD, le site n'est ouvert qu'en développement local ; sur Vercel, tout est fermé. */
export function authMode(): "on" | "off" | "misconfigured" {
  if (process.env.APP_PASSWORD) return "on";
  return process.env.VERCEL || process.env.NODE_ENV === "production" ? "misconfigured" : "off";
}

let cachedKey: { password: string; key: Buffer } | undefined;

function signingKey(password: string): Buffer {
  if (cachedKey?.password !== password) {
    cachedKey = { password, key: scryptSync(password, "vertical-session-v1", 32) };
  }
  return cachedKey.key;
}

function sign(payload: string, password: string) {
  return createHmac("sha256", signingKey(password)).update(payload).digest("base64url");
}

/** Valeur du cookie de session pour une connexion qui commence maintenant. */
export function createSessionToken(): string {
  const password = process.env.APP_PASSWORD;
  if (!password) throw new Error("APP_PASSWORD manquant.");
  const payload = `v1.${Date.now() + SESSION_MAX_AGE * 1000}`;
  return `${payload}.${sign(payload, password)}`;
}

export function isValidSession(token: string | undefined): boolean {
  const mode = authMode();
  if (mode === "off") return true;
  const password = process.env.APP_PASSWORD;
  if (mode === "misconfigured" || !password || !token) return false;
  const [version, expires, signature] = token.split(".");
  if (version !== "v1" || !expires || !signature) return false;
  if (!safeEqual(signature, sign(`${version}.${expires}`, password))) return false;
  return Number(expires) > Date.now();
}

/** Comparaison en temps constant (pas d'indice sur le nombre de caractères justes). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac("sha256", "compare").update(a).digest();
  const hb = createHmac("sha256", "compare").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Tâches planifiées (étape 4) : en-tête `Authorization: Bearer <CRON_SECRET>`, comme Vercel Cron. */
export function isValidCronRequest(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && authorization && safeEqual(authorization, `Bearer ${secret}`));
}
