"use client";

import { useState } from "react";

const HELP: Record<"instagram" | "tiktok", { title: string; steps: string[] }> = {
  instagram: {
    title: "Connecter Instagram",
    steps: [
      "Un compte Instagram professionnel (Business ou Créateur) relié à une Page Facebook.",
      "Une app sur Meta for Developers, avec Facebook Login et les permissions de publication de Reels.",
      "L'identifiant et le secret de l'app renseignés dans les variables d'environnement Vercel.",
    ],
  },
  tiktok: {
    title: "Connecter TikTok",
    steps: [
      "Une app sur developers.tiktok.com avec la Content Posting API (video.upload, video.publish).",
      "La clé et le secret de l'app renseignés dans les variables d'environnement Vercel.",
      "Tant que l'app n'est pas auditée par TikTok, les vidéos arrivent en brouillon dans ton appli TikTok.",
    ],
  },
};

/** Bouton « Connecter » : la connexion OAuth arrive à l'étape 3, en attendant on explique quoi préparer. */
export default function ConnectButton({ platform }: { platform: "instagram" | "tiktok" }) {
  const [open, setOpen] = useState(false);
  const help = HELP[platform];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-lg bg-white px-4 text-sm font-semibold text-black"
      >
        Connecter
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={help.title}
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/70"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-zinc-900 p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-bold">{help.title}</h2>
            <p className="mb-3 text-zinc-300">
              La connexion n&apos;est pas encore disponible : elle arrive avec la publication
              automatique. Il faudra :
            </p>
            <ul className="mb-5 list-disc space-y-1 pl-5 text-sm text-zinc-400">
              {help.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-12 w-full rounded-xl bg-zinc-800 font-semibold"
            >
              Compris
            </button>
          </div>
        </div>
      )}
    </>
  );
}
