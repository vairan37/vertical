import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listAccounts } from "@/lib/accounts";
import { isDryRun } from "@/lib/social";
import { parseTikTokOptions } from "@/lib/tiktok-options";
import { displayName, getVideo, PLATFORMS } from "@/lib/videos";
import PausingVideo from "../../pausing-video";
import PublishSection from "../publish-section";
import VideoActions from "./video-actions";

export const metadata: Metadata = { title: "Vidéo · vertical" };

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

export default function VideoPage({ params }: PageProps<"/videos/[id]">) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 p-4 pb-12">
      <Link href="/videos" className="mb-4 inline-block py-2 text-sky-400">← Mes vidéos</Link>
      <Suspense fallback={<p className="text-zinc-400">Chargement…</p>}>
        <VideoDetail params={params} />
      </Suspense>
    </main>
  );
}

async function VideoDetail({ params }: { params: PageProps<"/videos/[id]">["params"] }) {
  const { id } = await params;
  const [video, accounts] = await Promise.all([getVideo(id), listAccounts()]);
  if (!video) notFound();

  const published = PLATFORMS.filter((p) => video.publications[p.id]?.status === "published");

  return (
    <div className="flex flex-col gap-5">
      <PausingVideo
        src={video.videoUrl}
        poster={video.coverUrl ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="mx-auto aspect-[9/16] w-full max-w-xs rounded-xl bg-black"
      />

      <VideoActions id={video.id} title={video.title ?? ""} placeholder={video.text || "Sans titre"} downloadUrl={video.downloadUrl} name={displayName(video)} />

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Publication</h2>
        {published.length === 1 && (
          <p className="rounded-lg bg-amber-950 px-3 py-2 text-sm text-amber-200">
            ⚠ Publiée seulement sur {published[0].label}
          </p>
        )}
        <PublishSection
          videoId={video.id}
          defaultCaption={video.caption ?? [video.text, video.author ? `- ${video.author}` : ""].filter(Boolean).join("\n")}
          defaultTiktok={parseTikTokOptions(video.tiktokOptions)}
          duration={video.duration}
          dryRun={isDryRun()}
          platforms={PLATFORMS.map((p) => ({
            ...p,
            publication: video.publications[p.id],
            connected: Boolean(accounts[p.id] && !accounts[p.id]?.expired && accounts[p.id]?.simulated === isDryRun()),
          }))}
        />
      </section>

      <section className="flex flex-col gap-1 text-sm text-zinc-400">
        <h2 className="mb-1 font-semibold text-foreground">Détails</h2>
        <p>Créée le {dateFormat.format(video.createdAt)}</p>
        {video.text && <p className="whitespace-pre-wrap">Texte : {video.text}</p>}
        {video.author && <p>Auteur : {video.author}</p>}
        <p>Durée : {video.duration} s</p>
        <p>Musique : {video.musicName ? video.musicName.replace(/\.mp3$/i, "") : "aucune (vidéo muette)"}</p>
        <p>Template : {video.templateName ?? "—"}</p>
      </section>
    </div>
  );
}
