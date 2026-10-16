import { connection } from "next/server";
import { Suspense } from "react";
import { listTemplates } from "@/lib/templates";
import Creator, { type TemplateOption } from "./creator";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 p-4 pb-12">
      <h1 className="mb-6 text-2xl font-bold">Nouvelle vidéo</h1>
      <Suspense fallback={<p className="text-zinc-400">Chargement…</p>}>
        <CreatorWithTemplates />
      </Suspense>
    </main>
  );
}

async function CreatorWithTemplates() {
  await connection();
  let templates: TemplateOption[] = [];
  try {
    templates = (await listTemplates()).map((t) => ({ id: t.id, name: t.name }));
  } catch (error) {
    // Sans base, on crée quand même avec le look d'origine.
    console.error("Lecture des templates impossible", error);
  }
  return <Creator templates={templates} />;
}
