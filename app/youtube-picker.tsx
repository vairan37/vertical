"use client";

import { useEffect, useRef, useState } from "react";

type Result = { id: string; title: string; channel: string; duration: number | null; thumbnail: string };

/** Durées d'extrait proposées, en secondes (90 s = durée max d'une vidéo). */
const LENGTHS = [15, 30, 45, 60, 90];

function formatTime(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** Champ vide = 0 ; on ne garde que les chiffres (clavier numérique du téléphone). */
function digits(value: string, max: number) {
  const n = value.replace(/\D/g, "").slice(0, 3);
  return n === "" ? "" : String(Math.min(max, Number(n)));
}

/**
 * Recherche YouTube et récupération d'un extrait (15 s par défaut, jusqu'à 90 s), transmis au
 * formulaire comme un fichier audio envoyé.
 */
export default function YoutubePicker({ onPick }: { onPick: (file: File, length: number) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [downloadReady, setDownloadReady] = useState(true);
  const [selected, setSelected] = useState<Result | null>(null);
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [length, setLength] = useState(15);
  const [busy, setBusy] = useState<"search" | "audio" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // L'erreur s'affiche près du bouton utilisé : on la fait défiler à l'écran.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  const start = Number(minutes || 0) * 60 + Number(seconds || 0);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy("search");
    setError(null);
    setSelected(null);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      const data = (await res.json().catch(() => ({}))) as { results?: Result[]; downloadReady?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erreur du serveur (${res.status}).`);
      setResults(data.results ?? []);
      setDownloadReady(data.downloadReady !== false);
    } catch (e) {
      setError(e instanceof TypeError ? "Connexion impossible. Vérifie ton réseau." : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function select(r: Result) {
    setSelected(r);
    setMinutes("");
    setSeconds("");
    setError(null);
  }

  async function useExcerpt() {
    if (!selected) return;
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
      // Un extrait qui s'arrête avant (fin du son) donne une vidéo plus courte.
      const available = selected.duration ? Math.min(length, selected.duration - start) : length;
      onPick(new File([await res.blob()], name, { type: "audio/mpeg" }), Math.max(3, Math.floor(available)));
      setOpen(false);
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

  const field = "w-16 rounded-xl border border-zinc-700 bg-zinc-950 px-2 py-3 text-center text-base";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Son YouTube</span>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-zinc-400">Fermer</button>
      </div>
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

          <div className="flex flex-col gap-1">
            <span>Début de l&apos;extrait</span>
            <div className="flex items-center gap-2">
              <input
                value={minutes}
                onChange={(e) => setMinutes(digits(e.target.value, 999))}
                inputMode="numeric"
                placeholder="0"
                aria-label="Minutes"
                className={field}
              />
              <span>min</span>
              <input
                value={seconds}
                onChange={(e) => setSeconds(digits(e.target.value, 59))}
                inputMode="numeric"
                placeholder="0"
                aria-label="Secondes"
                className={field}
              />
              <span>s</span>
              <span className="ml-auto text-sm text-zinc-400">= {formatTime(start)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span>Durée de l&apos;extrait</span>
            <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="Durée de l'extrait">
              {LENGTHS.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={length === l}
                  onClick={() => setLength(l)}
                  className={`min-h-11 rounded-lg text-sm font-semibold ${length === l ? "bg-white text-black" : "bg-zinc-800"}`}
                >
                  {l} s
                </button>
              ))}
            </div>
          </div>

          <button type="button" onClick={useExcerpt} disabled={busy !== null} className="min-h-12 rounded-xl bg-white font-semibold text-black disabled:opacity-50">
            {busy === "audio" ? "Récupération de l'extrait…" : `Utiliser ${formatTime(start)} → ${formatTime(start + length)}`}
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
