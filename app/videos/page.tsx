import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DbNotConfiguredError } from "@/lib/db";
import type { Platform } from "@/lib/db";
import { listVideos, PLATFORMS, type Publication, type VideoWithPublications } from "@/lib/videos";
import { setManualPublication } from "./actions";
import SubmitButton from "./submit-button";

export const metadata: Metadata = { title: "Mes vidéos · vertical" };

export default function VideosPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 p-4 pb-12">
      <h1 className="mb-6 text-2xl font-bold">Mes vidéos</h1>
      <Suspense fallback={<p className="text-zinc-400">Chargement…</p>}>
        <VideoList />
      </Suspense>
    </main>
  );
}

async function VideoList() {
  await connection();
  let items: VideoWithPublications[];
  try {
    items = await listVideos();
  } catch (error) {
    console.error("Lecture des vidéos impossible", error);
    return (
      <p role="alert" className="rounded-xl bg-red-950 px-4 py-3 text-red-200">
        {error instanceof DbNotConfiguredError
          ? error.message
          : "Impossible de lire les vidéos depuis la base de données."}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-zinc-400">
        Aucune vidéo pour l&apos;instant.{" "}
        <Link href="/" className="text-sky-400 underline">Créer la première</Link>
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {items.map((v) => (
        <VideoCard key={v.id} video={v} />
      ))}
    </ul>
  );
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

function VideoCard({ video }: { video: VideoWithPublications }) {
  const published = PLATFORMS.filter((p) => video.publications[p.id]?.status === "published");
  const desync = published.length === 1;

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex gap-3">
        <a href={video.videoUrl} target="_blank" rel="noreferrer" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={video.imageUrl}
            alt="Aperçu de la vidéo"
            className="aspect-[9/16] w-20 rounded-lg bg-black object-cover"
          />
        </a>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="line-clamp-3 break-words font-semibold">{video.text || "(sans texte)"}</p>
          <p className="text-sm text-zinc-400">{dateFormat.format(video.createdAt)}</p>
          <p className="truncate text-sm text-zinc-500">
            {video.duration} s · {video.musicName.replace(/\.mp3$/i, "")}
          </p>
          <a href={video.downloadUrl} className="text-sm text-sky-400 underline">Télécharger</a>
        </div>
      </div>

      {desync && (
        <p className="rounded-lg bg-amber-950 px-3 py-2 text-sm text-amber-200">
          ⚠ Publiée seulement sur {published[0].label}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {PLATFORMS.map((p) => (
          <PlatformRow key={p.id} videoId={video.id} platform={p.id} label={p.label} publication={video.publications[p.id]} />
        ))}
      </div>
    </li>
  );
}

const STATUS: Record<Publication["status"], { text: string; className: string }> = {
  pending: { text: "En attente", className: "text-zinc-300" },
  processing: { text: "En cours…", className: "text-sky-300" },
  published: { text: "Publiée ✓", className: "text-green-400" },
  failed: { text: "Échec", className: "text-red-400" },
};

function PlatformRow({
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
    <div className="flex flex-col gap-1 rounded-xl bg-zinc-950 px-3 py-2">
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
