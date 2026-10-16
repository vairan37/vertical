// Applique les migrations SQL de ./drizzle. Lancé avant chaque build (donc à chaque déploiement Vercel).
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL absente : migrations ignorées.");
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Migrations appliquées.");
} finally {
  await pool.end();
}
