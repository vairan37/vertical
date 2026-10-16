import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DbNotConfiguredError } from "@/lib/db";
import { displayName, listVideos, PLATFORMS, type VideoWithPublications } from "@/lib/videos";

export const metadata: Metadata = { title: "Mes vidéos · vertical" };

export default function VideosPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 pb-12">
      <h1 className="p-4 text-2xl font-bold">Mes vidéos</h1>
      <Suspense fallback={<p className="px-4 text-zinc-400">Chargement…</p>}>
        <VideoGrid />
      </Suspense>
    </main>
  );
}

async function VideoGrid() {
  await connection();
  let items: VideoWithPublications[];
  try {
    items = await listVideos();
  } catch (error) {
    console.error("Lecture des vidéos impossible", error);
    return (
      <p role="alert" className="mx-4 rounded-xl bg-red-950 px-4 py-3 text-red-200">
        {error instanceof DbNotConfiguredError
          ? error.message
          : "Impossible de lire les vidéos depuis la base de données."}
      </p>
    );
  }

  return (
    <>
      <p className="px-4 pb-3 text-sm text-zinc-400">
        {items.length} vidéo{items.length > 1 ? "s" : ""}
      </p>
      <ul className="grid grid-cols-3 gap-0.5">
        <li>
          <Link
            href="/"
            className="flex aspect-[9/16] flex-col items-center justify-center gap-1 bg-zinc-900 text-zinc-400"
          >
            <span className="text-4xl leading-none">+</span>
            <span className="text-xs">Nouvelle</span>
          </Link>
        </li>
        {items.map((v) => (
          <VideoTile key={v.id} video={v} />
        ))}
      </ul>
    </>
  );
}

function VideoTile({ video }: { video: VideoWithPublications }) {
  const published = PLATFORMS.filter((p) => video.publications[p.id]?.status === "published");
  const desync = published.length === 1;
  return (
    <li>
      <Link href={`/videos/${video.id}`} className="relative block aspect-[9/16] overflow-hidden bg-zinc-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={video.coverUrl ?? video.imageUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute right-1 top-1 flex gap-1">
          {PLATFORMS.map((p) => (
            <span
              key={p.id}
              title={`${p.label} : ${video.publications[p.id]?.status === "published" ? "publiée" : "non publiée"}`}
              className={`rounded px-1 text-[10px] font-bold leading-4 ${
                video.publications[p.id]?.status === "published"
                  ? "bg-green-500 text-black"
                  : "bg-black/60 text-zinc-400"
              }`}
            >
              {p.id === "instagram" ? "IG" : "TT"}
            </span>
          ))}
        </div>
        {desync && <span className="absolute left-1 top-1 text-sm" title="Publiée sur un seul réseau">⚠</span>}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1.5 pb-1.5 pt-6">
          <p className="line-clamp-2 break-words text-xs font-semibold text-white">{displayName(video)}</p>
        </div>
      </Link>
    </li>
  );
}
