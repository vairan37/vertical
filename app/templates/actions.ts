"use server";

import { requireAuth } from "@/lib/auth";
import { asc, eq, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, templates } from "@/lib/db";
import { DEFAULT_SETTINGS, parseSettings } from "@/lib/template-settings";
import { getTemplate, UUID } from "@/lib/templates";

const MAX_NAME = 60;

function cleanName(name: unknown) {
  const n = String(name ?? "").trim().slice(0, MAX_NAME);
  return n || "Sans nom";
}

export async function createTemplate() {
  await requireAuth();
  const [row] = await getDb()
    .insert(templates)
    .values({ name: "Nouvelle template", settings: DEFAULT_SETTINGS })
    .returning({ id: templates.id });
  redirect(`/templates/${row.id}`);
}

export async function duplicateTemplate(id: string) {
  await requireAuth();
  const source = await getTemplate(id);
  if (!source) throw new Error("Template introuvable.");
  await getDb()
    .insert(templates)
    .values({ name: cleanName(`${source.name} (copie)`), settings: parseSettings(source.settings) });
  refresh();
}

/** Enregistre le nom et les réglages. Renvoie un message d'erreur en français, ou null. */
export async function updateTemplate(id: string, name: string, settings: unknown): Promise<string | null> {
  await requireAuth();
  if (!UUID.test(id)) return "Template introuvable.";
  const updated = await getDb()
    .update(templates)
    .set({ name: cleanName(name), settings: parseSettings(settings), updatedAt: new Date() })
    .where(eq(templates.id, id))
    .returning({ id: templates.id });
  if (updated.length === 0) return "Cette template n'existe plus.";
  refresh();
  return null;
}

/** Les vidéos déjà créées sont conservées : leur lien vers la template passe à null. */
export async function deleteTemplate(id: string): Promise<string | null> {
  await requireAuth();
  if (!UUID.test(id)) return "Template introuvable.";
  await getDb().transaction(async (tx) => {
    const [deleted] = await tx.delete(templates).where(eq(templates.id, id)).returning();
    // Si c'était la template par défaut, la plus ancienne restante prend le relais.
    if (deleted?.isDefault) {
      const [next] = await tx.select({ id: templates.id }).from(templates).orderBy(asc(templates.createdAt)).limit(1);
      if (next) await tx.update(templates).set({ isDefault: true }).where(eq(templates.id, next.id));
    }
  });
  return null;
}

export async function setDefaultTemplate(id: string) {
  await requireAuth();
  if (!UUID.test(id)) throw new Error("Template introuvable.");
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.update(templates).set({ isDefault: false }).where(ne(templates.id, id));
    await tx.update(templates).set({ isDefault: true }).where(eq(templates.id, id));
  });
  refresh();
}
