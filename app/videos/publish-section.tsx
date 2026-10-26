"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Platform } from "@/lib/db";
import { EMPTY_TIKTOK_OPTIONS, tiktokOptionsError, type CreatorInfo, type TikTokOptions } from "@/lib/tiktok-options";
import type { Publication } from "@/lib/videos";
import TikTokFields from "../tiktok-fields";
import { cancelPublication, setManualPublication } from "./actions";
import { ui } from "../ui";

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
  defaultTiktok,
  duration,
  platforms,
  dryRun,
}: {
  videoId: string;
  defaultCaption: string;
  /** Options TikTok choisies à la création (ou null). */
  defaultTiktok: TikTokOptions | null;
  duration: number;
  platforms: PlatformInfo[];
  dryRun: boolean;
}) {
  const [caption, setCaption] = useState(defaultCaption);
  const [tiktok, setTiktok] = useState<TikTokOptions>(defaultTiktok ?? EMPTY_TIKTOK_OPTIONS);
  const [creator, setCreator] = useState<CreatorInfo | null>(null);
  // Réglages TikTok repliés : ils s'ouvrent au premier « Publier » sur TikTok.
  const [tiktokOpen, setTiktokOpen] = useState(false);
  const [busy, setBusy] = useState<Platform | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const canStart = (p: PlatformInfo) =>
    p.connected && p.publication?.status !== "published" && p.publication?.status !== "processing";
  const needsCaption = platforms.some(canStart);
  const tiktokRow = platforms.find((p) => p.id === "tiktok");

  /** `start` : nouvel envoi (légende et options enregistrées) ; sinon simple suivi (« Vérifier »). */
  async function publish(platform: Platform, start: boolean) {
    if (start && platform === "tiktok") {
      if (!creator) return setError("Compte TikTok illisible : réessaie de le charger.");
      const invalid = tiktokOptionsError(tiktok, creator, duration);
      if (invalid) return setError(invalid);
    }
    setBusy(platform);
    setError(null);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          start ? { videoId, platform, caption, tiktok: platform === "tiktok" ? tiktok : undefined } : { videoId, platform },
        ),
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
        <p className={ui.warn}>
          Mode simulation : rien n&apos;est envoyé aux réseaux.
        </p>
      )}
      {needsCaption && (
        <label className="flex flex-col gap-1">
          <span className="text-sm text-zinc-400">Légende et hashtags</span>
          <textarea
            value={caption}
            maxLength={2200}
            rows={3}
            onChange={(e) => setCaption(e.target.value)}
            className={ui.field}
          />
        </label>
      )}

      {platforms.map(({ id, label, publication, connected }) => {
        const status = publication ? STATUS[publication.status] : { text: "Non publiée", className: "text-zinc-500" };
        const simulated = publication?.externalId?.startsWith("sim_");
        const fromApi = Boolean(publication?.externalId);
        const isBusy = busy === id;
        return (
          <div key={id} className="flex flex-col gap-2 rounded-xl bg-zinc-950 px-3 py-2">
            <div className="flex min-h-11 items-center gap-3">
              <span className="w-20 shrink-0 font-medium">{label}</span>
              <span className={`flex-1 text-sm ${status.className}`}>
                {isBusy ? (
                  <span className="text-sky-300">{id === "instagram" ? "Publication… (jusqu'à 4 min)" : "Envoi à TikTok…"}</span>
                ) : publication?.status === "published" && publication.url ? (
                  <a href={publication.url} target="_blank" rel="noreferrer" className="underline">{status.text}</a>
                ) : (
                  status.text
                )}
                {simulated && !isBusy ? " (simulation)" : ""}
              </span>
            </div>

            {publication?.status === "processing" && !publication.error && (
              <p className="text-sm text-zinc-300">
                {id === "tiktok"
                  ? "TikTok traite la vidéo (quelques minutes) : touche « Vérifier » pour voir où elle en est."
                  : "Instagram traite le Reel : touche « Vérifier » dans un instant."}
              </p>
            )}
            {publication?.error && (
              <p className={`text-sm ${publication.status === "failed" ? "text-red-300" : "text-amber-200"}`}>{publication.error}</p>
            )}

            {id === "tiktok" && tiktokOpen && tiktokRow && canStart(tiktokRow) && (
              <TikTokFields value={tiktok} onChange={setTiktok} onCreator={setCreator} />
            )}

            <div className="flex flex-wrap gap-2">
              {publication?.status !== "published" && publication?.status !== "processing" && (
                connected ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => (id === "tiktok" && !tiktokOpen ? setTiktokOpen(true) : publish(id, true))}
                    className={`${small} bg-white font-semibold text-black`}
                  >
                    {id === "tiktok" && tiktokOpen ? "Confirmer" : publication?.status === "failed" ? "Réessayer" : "Publier"}
                  </button>
                ) : (
                  <a href="/publiees" className={`${small} flex items-center bg-zinc-800`}>Connecter le compte</a>
                )
              )}
              {publication?.status === "processing" && (
                <>
                  <button type="button" disabled={busy !== null} onClick={() => publish(id, false)} className={`${small} bg-white font-semibold text-black`}>
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
        <p role="alert" className={ui.error}>{error}</p>
      )}
    </div>
  );
}
