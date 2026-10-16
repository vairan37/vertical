"use client";

import { useEffect, useRef, useState } from "react";
import ExcerptFields, { formatTime, type Excerpt } from "./excerpt-fields";

export type YoutubeResult = { id: string; title: string; channel: string; duration: number | null; thumbnail: string };

/** Ce qui a été choisi sur YouTube, gardé pour pouvoir modifier l'extrait ensuite. */
export type YoutubeChoice = { video: YoutubeResult; excerpt: Excerpt };

type Props = {
  /** Fichier MP3 de l'extrait, et le choix qui l'a produit. */
  onPick: (file: File, choice: YoutubeChoice) => void;
  /** Modification d'un extrait existant : s'ouvre directement sur la vidéo choisie. */
  initial?: YoutubeChoice;
  onClose?: () => void;
};

/**
 * Recherche YouTube et récupération d'un extrait (15 s par défaut, jusqu'à 90 s), transmis au
 * formulaire comme un fichier audio envoyé. Rouvert avec `initial` pour modifier l'extrait.
 */
export default function YoutubePicker({ onPick, initial, onClose }: Props) {
  const [open, setOpen] = useState(Boolean(initial));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YoutubeResult[] | null>(null);
  const [downloadReady, setDownloadReady] = useState(true);
  const [selected, setSelected] = useState<YoutubeResult | null>(initial?.video ?? null);
  const [excerpt, setExcerpt] = useState<Excerpt>(initial?.excerpt ?? { start: 0, length: 15 });
  const [busy, setBusy] = useState<"search" | "audio" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // L'erreur s'affiche près du bouton utilisé : on la fait défiler à l'écran.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  function close() {
    setOpen(false);
    onClose?.();
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy("search");
    setError(null);
    setSelected(null);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      const data = (await res.json().catch(() => ({}))) as { results?: YoutubeResult[]; downloadReady?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erreur du serveur (${res.status}).`);
      setResults(data.results ?? []);
      setDownloadReady(data.downloadReady !== false);
    } catch (e) {
      setError(e instanceof TypeError ? "Connexion impossible. Vérifie ton réseau." : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function select(r: YoutubeResult) {
    setSelected(r);
    setExcerpt({ start: 0, length: excerpt.length });
    setError(null);
  }

  async function useExcerpt() {
    if (!selected) return;
    const { start, length } = excerpt;
    if (selected.duration && start >= selected.duration) {
      return setError(`Le début dépasse la fin du son (${formatTime(selected.duration)}).`);
    }
    setBusy("audio");
    setError(null);
    try {
      const res = await fetch("/api/youtube/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, start, length }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Erreur du serveur (${res.status}).`);
      }
      const title = decodeURIComponent(res.headers.get("X-Title") ?? "") || selected.title;
      const name = `${title} (${formatTime(start)}).mp3`.replace(/[\\/]/g, "-");
      onPick(new File([await res.blob()], name, { type: "audio/mpeg" }), { video: { ...selected, title }, excerpt });
      close();
    } catch (e) {
      setError(e instanceof TypeError ? "Connexion impossible. Vérifie ton réseau." : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-12 w-full rounded-xl bg-red-700 font-semibold">
        Chercher un son sur YouTube
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{initial ? "Modifier l'extrait YouTube" : "Son YouTube"}</span>
        <button type="button" onClick={close} className="min-h-11 px-3 text-zinc-400">Fermer</button>
      </div>

      {!initial && (
        <form onSubmit={search} className="flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Titre, artiste…"
            enterKeyHint="search"
            className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-base"
          />
          <button type="submit" disabled={busy !== null} className="rounded-xl bg-white px-4 font-semibold text-black disabled:opacity-50">
            {busy === "search" ? "…" : "OK"}
          </button>
        </form>
      )}

      {!downloadReady && (
        <p className="rounded-xl bg-amber-950 px-3 py-2 text-sm text-amber-200">
          ⚠ Les cookies YouTube ne sont pas configurés sur le serveur : la recherche marche, mais la
          récupération de l&apos;extrait sera refusée par YouTube (voir README, « Sons YouTube »).
        </p>
      )}

      {results && results.length === 0 && <p className="text-sm text-zinc-400">Aucun résultat.</p>}
      {results && results.length > 0 && (
        <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => select(r)}
                className={`flex w-full items-center gap-3 rounded-xl p-2 text-left ${selected?.id === r.id ? "bg-zinc-800 ring-2 ring-white" : "bg-zinc-900"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.thumbnail} alt="" loading="lazy" className="h-12 w-20 shrink-0 rounded-md bg-black object-cover" />
                <span className="flex min-w-0 flex-col">
                  <span className="line-clamp-2 text-sm font-semibold">{r.title}</span>
                  <span className="truncate text-xs text-zinc-400">
                    {r.channel}{r.duration ? ` · ${formatTime(r.duration)}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="flex flex-col gap-3 rounded-xl bg-zinc-900 p-3">
          <p className="line-clamp-2 text-sm font-semibold">{selected.title}</p>
          <a href={`https://www.youtube.com/watch?v=${selected.id}`} target="_blank" rel="noreferrer" className="text-sm text-sky-400 underline">
            Écouter sur YouTube pour trouver le bon moment
          </a>
          <ExcerptFields key={selected.id} value={excerpt} onChange={setExcerpt} />
          <button type="button" onClick={useExcerpt} disabled={busy !== null} className="min-h-12 rounded-xl bg-white font-semibold text-black disabled:opacity-50">
            {busy === "audio"
              ? "Récupération de l'extrait…"
              : `Utiliser ${formatTime(excerpt.start)} → ${formatTime(excerpt.start + excerpt.length)}`}
          </button>
        </div>
      )}

      {error && (
        <p ref={errorRef} role="alert" className="rounded-xl bg-red-950 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
