import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export class DbNotConfiguredError extends Error {
  constructor() {
    super("La base de données n'est pas configurée (variable DATABASE_URL manquante).");
  }
}

let instance: NodePgDatabase<typeof schema> | undefined;

/** Connexion paresseuse : rien n'est ouvert tant qu'aucune requête n'est faite. */
export function getDb() {
  if (!instance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new DbNotConfiguredError();
    instance = drizzle(new Pool({ connectionString, max: 3 }), { schema });
  }
  return instance;
}

export * from "./schema";
