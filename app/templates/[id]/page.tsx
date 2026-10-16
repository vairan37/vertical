import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { parseSettings } from "@/lib/template-settings";
import { getTemplate } from "@/lib/templates";
import Editor from "./editor";

export const metadata: Metadata = { title: "Modifier la template · vertical" };

export default function TemplatePage({ params }: PageProps<"/templates/[id]">) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 p-4 pb-12">
      <Link href="/templates" className="mb-4 inline-block py-2 text-sky-400">← Templates</Link>
      <Suspense fallback={<p className="text-zinc-400">Chargement…</p>}>
        <TemplateEditor params={params} />
      </Suspense>
    </main>
  );
}

async function TemplateEditor({ params }: { params: PageProps<"/templates/[id]">["params"] }) {
  const { id } = await params;
  const template = await getTemplate(id);
  if (!template) notFound();
  return <Editor id={template.id} initialName={template.name} initialSettings={parseSettings(template.settings)} />;
}
