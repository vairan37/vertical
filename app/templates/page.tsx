import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DbNotConfiguredError } from "@/lib/db";
import { previewUrl } from "@/lib/template-preview";
import { parseSettings } from "@/lib/template-settings";
import { listTemplates, type Template } from "@/lib/templates";
import SubmitButton from "../videos/submit-button";
import { createTemplate, duplicateTemplate, setDefaultTemplate } from "./actions";

export const metadata: Metadata = { title: "Templates · vertical" };

export default function TemplatesPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 p-4 pb-12">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Templates</h1>
        <form action={createTemplate}>
          <SubmitButton className="min-h-11 rounded-xl bg-white px-4 font-semibold text-black">+ Nouvelle</SubmitButton>
        </form>
      </div>
      <Suspense fallback={<p className="text-zinc-400">Chargement…</p>}>
        <TemplateList />
      </Suspense>
    </main>
  );
}

async function TemplateList() {
  await connection();
  let items: Template[];
  try {
    items = await listTemplates();
  } catch (error) {
    console.error("Lecture des templates impossible", error);
    return (
      <p role="alert" className="rounded-xl bg-red-950 px-4 py-3 text-red-200">
        {error instanceof DbNotConfiguredError ? error.message : "Impossible de lire les templates."}
      </p>
    );
  }
  if (items.length === 0) {
    return <p className="text-zinc-400">Aucune template : les vidéos utilisent le look d&apos;origine.</p>;
  }
  return (
    <ul className="grid grid-cols-2 gap-3">
      {items.map((t) => (
        <li key={t.id} className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-2">
          <Link href={`/templates/${t.id}`} className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl(parseSettings(t.settings))}
              alt={`Aperçu de ${t.name}`}
              loading="lazy"
              className="aspect-[9/16] w-full rounded-lg bg-black object-cover"
            />
            <span className="truncate px-1 font-semibold">{t.name}</span>
          </Link>
          {t.isDefault ? (
            <span className="px-1 text-sm text-green-400">Par défaut ✓</span>
          ) : (
            <form action={setDefaultTemplate.bind(null, t.id)}>
              <SubmitButton className="min-h-11 w-full rounded-lg bg-zinc-800 text-sm">Par défaut</SubmitButton>
            </form>
          )}
          <form action={duplicateTemplate.bind(null, t.id)}>
            <SubmitButton className="min-h-11 w-full rounded-lg bg-zinc-800 text-sm">Dupliquer</SubmitButton>
          </form>
        </li>
      ))}
    </ul>
  );
}
