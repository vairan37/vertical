import type { Platform } from "@/lib/db";
import type { Publication } from "@/lib/videos";
import { setManualPublication } from "./actions";
import SubmitButton from "./submit-button";

const STATUS: Record<Publication["status"], { text: string; className: string }> = {
  pending: { text: "En attente", className: "text-zinc-300" },
  processing: { text: "En cours…", className: "text-sky-300" },
  published: { text: "Publiée ✓", className: "text-green-400" },
  failed: { text: "Échec", className: "text-red-400" },
};

/** Statut d'une vidéo sur une plateforme, avec le marquage manuel « publiée ». */
export default function PlatformRow({
  videoId,
  platform,
  label,
  publication,
}: {
  videoId: string;
  platform: Platform;
  label: string;
  publication?: Publication;
}) {
  const status = publication ? STATUS[publication.status] : { text: "Non publiée", className: "text-zinc-500" };
  const isPublished = publication?.status === "published";
  // Une publication faite par l'API ne se « dé-marque » pas à la main.
  const canToggle = !publication?.externalId;

  return (
    <div className="flex flex-col gap-1 rounded-xl bg-zinc-900 px-3 py-2">
      <div className="flex min-h-11 items-center gap-3">
        <span className="w-20 shrink-0 font-medium">{label}</span>
        <span className={`flex-1 whitespace-nowrap text-sm ${status.className}`}>
          {isPublished && publication?.url ? (
            <a href={publication.url} target="_blank" rel="noreferrer" className="underline">{status.text}</a>
          ) : (
            status.text
          )}
        </span>
        {canToggle && (
          <form action={setManualPublication.bind(null, videoId, platform, !isPublished)}>
            <SubmitButton className="min-h-11 rounded-lg bg-zinc-800 px-3 text-sm">
              {isPublished ? "Annuler" : "Marquer publiée"}
            </SubmitButton>
          </form>
        )}
      </div>
      {publication?.status === "failed" && publication.error && (
        <p className="text-sm text-red-300">{publication.error}</p>
      )}
    </div>
  );
}
