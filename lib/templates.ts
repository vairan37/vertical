import { asc, desc, eq } from "drizzle-orm";
import { getDb, templates } from "./db";
import { DEFAULT_SETTINGS, parseSettings, type TemplateSettings } from "./template-settings";

export type Template = typeof templates.$inferSelect;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Templates triées : celle par défaut d'abord, puis par nom. */
export async function listTemplates(): Promise<Template[]> {
  return getDb().select().from(templates).orderBy(desc(templates.isDefault), asc(templates.name));
}

export async function getTemplate(id: string): Promise<Template | null> {
  if (!UUID.test(id)) return null;
  const [row] = await getDb().select().from(templates).where(eq(templates.id, id));
  return row ?? null;
}

/**
 * Réglages à utiliser pour un rendu : la template demandée, sinon celle par défaut,
 * sinon le look d'origine (s'il n'existe plus aucune template).
 */
export async function resolveTemplate(id: string | null): Promise<{ id: string | null; settings: TemplateSettings }> {
  const chosen = id ? await getTemplate(id) : null;
  const template = chosen ?? (await listTemplates())[0];
  return template
    ? { id: template.id, settings: parseSettings(template.settings) }
    : { id: null, settings: DEFAULT_SETTINGS };
}
