"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Platform } from "@/lib/db";
import type { Publication } from "@/lib/videos";
import { cancelPublication, setManualPublication } from "./actions";

export type PlatformInfo = {
  id: Platform;
  label: string;
  publication?: Publication;
  /** Compte connecté et utilisable (non expiré). */
  connected: boolean;
};

const STATUS: Record<Publication["status"], { text: string; className: string }> = {
  pending: { text: "En attente", className: "text-zinc-300" },
  processing: { text: "En cours…", className: "text-sky-300" },
  published: { text: "Publiée ✓", className: "text-green-400" },
  failed: { text: "Échec", className: "text-red-400" },
};

/** Publication d'une vidéo : légende, puis par réseau statut, « Publier » / « Réessayer » / « Vérifier ». */
export default function PublishSection({
  videoId,
  defaultCaption,
  platforms,
  dryRun,
}: {
  videoId: string;
  defaultCaption: string;
  platforms: PlatformInfo[];
  dryRun: boolean;
}) {
  const [caption, setCaption] = useState(defaultCaption);
  const [busy, setBusy] = useState<Platform | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const needsCaption = platforms.some((p) => p.id === "instagram" && p.publication?.status !== "published");

  async function publish(platform: Platform) {
    setBusy(platform);
    setError(null);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, platform, caption }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? `Erreur du serveur (${res.status}).`);
    } catch {
      setError("Connexion perdue. La publication continue peut-être : touche « Vérifier » dans un instant.");
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch {
      setError("L'action a échoué. Vérifie ta connexion.");
    }
  }

  const small = "min-h-11 rounded-lg px-3 text-sm disabled:opacity-50";

  return (
    <div className="flex flex-col gap-3">
      {dryRun && (
        <p className="rounded-lg bg-amber-950 px-3 py-2 text-sm text-amber-200">
          Mode simulation : « Publier » ne publie rien pour de vrai.
        </p>
      )}
      {needsCaption && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-400">Légende Instagram (sur TikTok, elle s&apos;écrit dans l&apos;appli)</span>
          <textarea
            value={caption}
            maxLength={2200}
            rows={3}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-base"
          />
        </label>
      )}

      {platforms.map(({ id, label, publication, connected }) => {
        const status = publication ? STATUS[publication.status] : { text: "Non publiée", className: "text-zinc-500" };
        const simulated = publication?.externalId?.startsWith("sim_");
        const fromApi = Boolean(publication?.externalId);
        const isBusy = busy === id;
        return (
          <div key={id} className="flex flex-col gap-2 rounded-xl bg-zinc-900 px-3 py-2">
            <div className="flex min-h-11 items-center gap-3">
              <span className="w-20 shrink-0 font-medium">{label}</span>
              <span className={`flex-1 text-sm ${status.className}`}>
                {isBusy ? (
                  <span className="text-sky-300">{id === "instagram" ? "Publication… (jusqu'à 4 min)" : "Envoi…"}</span>
                ) : publication?.status === "published" && publication.url ? (
                  <a href={publication.url} target="_blank" rel="noreferrer" className="underline">{status.text}</a>
                ) : (
                  status.text
                )}
                {simulated && !isBusy ? " (simulation)" : ""}
              </span>
            </div>

            {publication?.status === "processing" && id === "tiktok" && publication.externalId && !publication.error && (
              <p className="text-sm text-zinc-300">
                Brouillon envoyé dans ton appli TikTok : ouvre la notification pour publier, puis touche « Vérifier ».
              </p>
            )}
            {publication?.error && (
              <p className={`text-sm ${publication.status === "failed" ? "text-red-300" : "text-amber-200"}`}>{publication.error}</p>
            )}

            <div className="flex flex-wrap gap-2">
              {publication?.status !== "published" && publication?.status !== "processing" && (
                connected ? (
                  <button type="button" disabled={busy !== null} onClick={() => publish(id)} className={`${small} bg-white font-semibold text-black`}>
                    {publication?.status === "failed" ? "Réessayer" : id === "tiktok" ? "Envoyer en brouillon" : "Publier"}
                  </button>
                ) : (
                  <a href="/publiees" className={`${small} flex items-center bg-zinc-800`}>Connecter le compte</a>
                )
              )}
              {publication?.status === "processing" && (
                <>
                  <button type="button" disabled={busy !== null} onClick={() => publish(id)} className={`${small} bg-white font-semibold text-black`}>
                    Vérifier
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => run(() => cancelPublication(videoId, id))} className={`${small} bg-zinc-800`}>
                    Abandonner
                  </button>
                </>
              )}
              {/* Marquage manuel : pour une vidéo publiée à la main (jamais pour une publication faite par l'API). */}
              {!fromApi && publication?.status !== "processing" && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run(() => setManualPublication(videoId, id, publication?.status !== "published"))}
                  className={`${small} bg-zinc-800`}
                >
                  {publication?.status === "published" ? "Annuler" : "Marquer publiée"}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {error && (
        <p role="alert" className="rounded-xl bg-red-950 px-3 py-2 text-sm text-red-200">{error}</p>
      )}
    </div>
  );
}
