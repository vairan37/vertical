import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/*
 * Chiffrement des tokens des réseaux sociaux avant de les mettre en base (AES-256-GCM).
 * Clé : TOKEN_ENCRYPTION_KEY (une longue chaîne aléatoire), ramenée à 32 octets par SHA-256.
 * Format stocké : v1.<iv>.<tag>.<données>, en base64url.
 */

function key(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error("TOKEN_ENCRYPTION_KEY manquante (16 caractères minimum) : ajoute-la sur Vercel puis redéploie.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decrypt(stored: string): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Token chiffré illisible.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
