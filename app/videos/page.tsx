import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DbNotConfiguredError } from "@/lib/db";
import { listVideos, type VideoWithPublications } from "@/lib/videos";
import VideoGrid from "./video-grid";

export const metadata: Metadata = { title: "Mes vidéos · vertical" };

export default function VideosPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 pb-12">
      <h1 className="p-4 text-2xl font-bold">Mes vidéos</h1>
      <Suspense fallback={<p className="px-4 text-zinc-400">Chargement…</p>}>
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
      <p role="alert" className="mx-4 rounded-xl bg-red-950 px-4 py-3 text-red-200">
        {error instanceof DbNotConfiguredError
          ? error.message
          : "Impossible de lire les vidéos depuis la base de données."}
      </p>
    );
  }

  return <VideoGrid items={items} />;
}
