import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { listAccounts } from "@/lib/accounts";
import { getTikTokSettings } from "@/lib/publish-settings";
import { isDryRun } from "@/lib/social";
import { parseTikTokOptions, type TikTokOptions } from "@/lib/tiktok-options";
import { displayName, getVideo, PLATFORMS } from "@/lib/videos";
import PausingVideo from "../../pausing-video";
import PublishSection from "../publish-section";
import VideoActions from "./video-actions";
import { ui } from "../../ui";

export const metadata: Metadata = { title: "Vidéo · vertical" };

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

export default function VideoPage({ params }: PageProps<"/videos/[id]">) {
  return (
    <main className={ui.page}>
      <Link href="/videos" className="-mb-2 self-start py-2 text-sky-400">← Mes vidéos</Link>
      <Suspense fallback={<p className={ui.hint}>Chargement…</p>}>
        <VideoDetail params={params} />
      </Suspense>
    </main>
  );
}

async function VideoDetail({ params }: { params: PageProps<"/videos/[id]">["params"] }) {
  const { id } = await params;
  const [video, accounts, tiktokSettings] = await Promise.all([getVideo(id), listAccounts(), getTikTokSettings()]);
  if (!video) notFound();

  const published = PLATFORMS.filter((p) => video.publications[p.id]?.status === "published");

  return (
    <div className="flex flex-col gap-4">
      <PausingVideo
        src={video.videoUrl}
        poster={video.coverUrl ?? undefined}
        controls
        playsInline
        preload="metadata"
        className="mx-auto aspect-[9/16] w-full max-w-xs rounded-xl bg-black"
      />

      <section className={ui.card}>
        <h2 className={ui.label}>Publication</h2>
        {published.length === 1 && (
          <p className={ui.warn}>
            ⚠ Publiée seulement sur {published[0].label}
          </p>
        )}
        <PublishSection
          videoId={video.id}
          defaultCaption={video.caption ?? [video.text, video.author ? `- ${video.author}` : ""].filter(Boolean).join("\n")}
          defaultTiktok={tiktokDefaults(parseTikTokOptions(video.tiktokOptions), tiktokSettings)}
          duration={video.duration}
          dryRun={isDryRun()}
          platforms={PLATFORMS.map((p) => ({
            ...p,
            publication: video.publications[p.id],
            connected: Boolean(accounts[p.id] && !accounts[p.id]?.expired && accounts[p.id]?.simulated === isDryRun()),
          }))}
        />
      </section>

      <section className={ui.card}>
        <h2 className={ui.label}>Vidéo</h2>
        <VideoActions id={video.id} title={video.title ?? ""} placeholder={video.text || "Sans titre"} downloadUrl={video.downloadUrl} name={displayName(video)} />
      </section>

      <section className={`${ui.card} gap-1 text-sm text-zinc-400`}>
        <h2 className={`${ui.label} mb-2`}>Détails</h2>
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

/**
 * Réglages TikTok pour publier cette vidéo : ceux du compte (Publiées) s'ils existent, sinon ceux
 * enregistrés avec la vidéo ; la déclaration commerciale reste celle de la vidéo.
 */
function tiktokDefaults(stored: TikTokOptions | null, account: TikTokOptions | null): TikTokOptions | null {
  if (!account) return stored;
  const { privacyLevel, allowComment, allowDuet, allowStitch } = account;
  return { ...(stored ?? account), privacyLevel, allowComment, allowDuet, allowStitch };
}
