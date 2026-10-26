import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DbNotConfiguredError } from "@/lib/db";
import { listVideos, type VideoWithPublications } from "@/lib/videos";
import VideoGrid from "./video-grid";
import { ui } from "../ui";

export const metadata: Metadata = { title: "Mes vidéos · vertical" };

export default function VideosPage() {
  return (
    <main className={ui.page}>
      <h1 className={ui.title}>Mes vidéos</h1>
      <Suspense fallback={<p className={ui.hint}>Chargement…</p>}>
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
      <p role="alert" className={ui.error}>
        {error instanceof DbNotConfiguredError
          ? error.message
          : "Impossible de lire les vidéos depuis la base de données."}
      </p>
    );
  }

  return <VideoGrid items={items} />;
}
