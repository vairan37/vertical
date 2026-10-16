// Télécharge le binaire autonome yt-dlp (Linux x64, celui des fonctions Vercel) dans bin/yt-dlp.
// Version figée et empreinte SHA-256 vérifiée : on n'exécute jamais un binaire non contrôlé.
// Pour mettre à jour : changer VERSION et SHA256 (fichier SHA2-256SUMS de la release GitHub).
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";

const VERSION = "2026.08.19";
const SHA256 = "58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a";
const URL = `https://github.com/yt-dlp/yt-dlp/releases/download/${VERSION}/yt-dlp_linux`;
const TARGET = "bin/yt-dlp";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

if (process.platform !== "linux" || process.arch !== "x64") {
  console.log(`yt-dlp : plateforme ${process.platform}/${process.arch} non gérée, téléchargement ignoré.`);
  process.exit(0);
}

const existing = await readFile(TARGET).catch(() => null);
if (existing && sha256(existing) === SHA256) {
  console.log(`yt-dlp ${VERSION} déjà présent.`);
  process.exit(0);
}

const res = await fetch(URL);
if (!res.ok) throw new Error(`Téléchargement de yt-dlp impossible (${res.status}).`);
const data = Buffer.from(await res.arrayBuffer());
if (sha256(data) !== SHA256) throw new Error("Empreinte SHA-256 de yt-dlp incorrecte : binaire refusé.");
await mkdir("bin", { recursive: true });
await writeFile(TARGET, data);
await chmod(TARGET, 0o755);
console.log(`yt-dlp ${VERSION} installé dans ${TARGET}.`);
