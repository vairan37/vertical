import { and, count, eq, gt, lt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getDb, loginAttempts } from "./db";
import {
  authMode,
  createSessionToken,
  isValidSession,
  safeEqual,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "./session";

/*
 * proxy.ts bloque déjà toute requête sans session. Les Server Actions et les routes API
 * revérifient quand même (recommandation de Next : le proxy seul ne suffit pas).
 */

export class NotAuthenticatedError extends Error {
  constructor() {
    super("Session expirée : reconnecte-toi.");
  }
}

export async function isAuthenticated(): Promise<boolean> {
  return isValidSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** À appeler en tête de chaque Server Action. */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthenticated())) throw new NotAuthenticatedError();
}

/** À appeler en tête de chaque route API : renvoie une réponse 401 si la session manque. */
export async function denyUnauthenticated(): Promise<Response | null> {
  if (await isAuthenticated()) return null;
  return Response.json({ error: "Session expirée : reconnecte-toi." }, { status: 401 });
}

/** Limites d'essais : 5 erreurs par IP et 20 au total par quart d'heure. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 5;
const MAX_TOTAL = 20;

async function clientIp() {
  const h = await headers();
  return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "inconnue").trim();
}

/** Vérifie le mot de passe et ouvre la session. Renvoie un message d'erreur, ou null si connecté. */
export async function login(password: string): Promise<string | null> {
  const mode = authMode();
  if (mode === "misconfigured") {
    return "Le mot de passe n'est pas configuré : ajoute la variable APP_PASSWORD sur Vercel, puis redéploie.";
  }
  if (mode === "off") return null;

  const db = getDb();
  const ip = await clientIp();
  const since = new Date(Date.now() - WINDOW_MS);
  // Ménage : les anciens échecs ne servent plus à rien.
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [[mine], [all]] = await Promise.all([
    db.select({ n: count() }).from(loginAttempts).where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.createdAt, since))),
    db.select({ n: count() }).from(loginAttempts).where(gt(loginAttempts.createdAt, since)),
  ]);
  if (mine.n >= MAX_PER_IP || all.n >= MAX_TOTAL) {
    return "Trop d'essais ratés. Réessaie dans 15 minutes.";
  }

  if (!safeEqual(password, process.env.APP_PASSWORD ?? "")) {
    await db.insert(loginAttempts).values({ ip });
    const left = MAX_PER_IP - mine.n - 1;
    return left > 0
      ? `Mot de passe incorrect (encore ${left} essai${left > 1 ? "s" : ""}).`
      : "Mot de passe incorrect. Trop d'essais ratés : réessaie dans 15 minutes.";
  }

  await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return null;
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
}
