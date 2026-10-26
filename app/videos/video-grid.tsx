import Link from "next/link";
import { displayName, PLATFORMS, type VideoWithPublications } from "@/lib/videos";

/** Grille de couvertures façon profil TikTok (pages « Mes vidéos » et « Publiées »). */
export default function VideoGrid({
  items,
  showNew = true,
  empty,
}: {
  items: VideoWithPublications[];
  showNew?: boolean;
  empty?: React.ReactNode;
}) {
  if (items.length === 0 && !showNew) return <>{empty}</>;
  return (
    <div className="-mx-4 flex flex-col gap-2">
      <p className="px-4 text-sm text-zinc-500">
        {items.length} vidéo{items.length > 1 ? "s" : ""}
      </p>
      <ul className="grid grid-cols-3 gap-0.5">
        {showNew && (
          <li>
            <Link
              href="/"
              className="flex aspect-[9/16] flex-col items-center justify-center gap-1 bg-zinc-900 text-zinc-400"
            >
              <span className="text-4xl leading-none">+</span>
              <span className="text-xs">Nouvelle</span>
            </Link>
          </li>
        )}
        {items.map((v) => (
          <VideoTile key={v.id} video={v} />
        ))}
      </ul>
    </div>
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
