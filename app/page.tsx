import { connection } from "next/server";
import { Suspense } from "react";
import { listAccounts } from "@/lib/accounts";
import { isDryRun } from "@/lib/social";
import { usesVercelBlob } from "@/lib/storage";
import { parseSettings } from "@/lib/template-settings";
import { listTemplates } from "@/lib/templates";
import Creator, { type TemplateOption } from "./creator";
import { ui } from "./ui";

export default function Home() {
  return (
    <main className={ui.page}>
      <h1 className="sr-only">Nouvelle vidéo</h1>
      <Suspense fallback={<p className="text-zinc-400">Chargement…</p>}>
        <CreatorWithTemplates />
      </Suspense>
    </main>
  );
}

async function CreatorWithTemplates() {
  await connection();
  let templates: TemplateOption[] = [];
  const connected = { instagram: false, tiktok: false };
  try {
    const [rows, accounts] = await Promise.all([listTemplates(), listAccounts()]);
    templates = rows.map((t) => ({ id: t.id, name: t.name, settings: parseSettings(t.settings) }));
    for (const p of ["instagram", "tiktok"] as const) {
      const a = accounts[p];
      connected[p] = Boolean(a && !a.expired && a.simulated === isDryRun());
    }
  } catch (error) {
    // Sans base, on crée quand même avec le look d'origine (sans publication automatique).
    console.error("Lecture des templates ou des comptes impossible", error);
  }
  return <Creator templates={templates} blobUpload={usesVercelBlob()} connected={connected} />;
}
