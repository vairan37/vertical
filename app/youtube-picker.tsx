"use client";

import { useState } from "react";

type Result = { id: string; title: string; channel: string; duration: number | null; thumbnail: string };

const EXCERPT = 15;

function formatTime(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** « 1:23 », « 83 » ou « 1m23 » → secondes. */
function parseTime(value: string): number | null {
  const v = value.trim();
  const m = v.match(/^(\d+)\s*[:m]\s*(\d{1,2})s?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return /^\d+$/.test(v) ? Number(v) : null;
}

/**
 * Recherche YouTube et récupération d'un extrait de 15 s, transmis au formulaire comme un
 * fichier audio envoyé.
 */
export default function YoutubePicker({ onPick }: { onPick: (file: File) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [selected, setSelected] = useState<Result | null>(null);
  const [startText, setStartText] = useState("0:00");
  const [busy, setBusy] = useState<"search" | "audio" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setBusy("search");
    setError(null);
    setSelected(null);
    try {
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      const data = (await res.json().catch(() => ({}))) as { results?: Result[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erreur du serveur (${res.status}).`);
      setResults(data.results ?? []);
    } catch (e) {
      setError(e instanceof TypeError ? "Connexion impossible. Vérifie ton réseau." : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function useExcerpt() {
    if (!selected) return;
    const start = parseTime(startText);
    if (start === null) return setError("Point de départ invalide : écris par exemple 1:23.");
    if (selected.duration && start >= selected.duration) return setError("Le point de départ dépasse la fin du son.");
    setBusy("audio");
    setError(null);
    try {
      const res = await fetch("/api/youtube/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, start, length: EXCERPT }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Erreur du serveur (${res.status}).`);
      }
      const title = decodeURIComponent(res.headers.get("X-Title") ?? "") || selected.title;
      const name = `${title} (${formatTime(start)}).mp3`.replace(/[\\/]/g, "-");
      onPick(new File([await res.blob()], name, { type: "audio/mpeg" }));
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

  const input = "min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-base";

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
          className={input}
        />
        <button type="submit" disabled={busy !== null} className="rounded-xl bg-white px-4 font-semibold text-black disabled:opacity-50">
          {busy === "search" ? "…" : "OK"}
        </button>
      </form>

      {error && <p role="alert" className="rounded-xl bg-red-950 px-3 py-2 text-sm text-red-200">{error}</p>}

      {results && results.length === 0 && <p className="text-sm text-zinc-400">Aucun résultat.</p>}
      {results && results.length > 0 && (
        <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => { setSelected(r); setStartText("0:00"); setError(null); }}
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
        <div className="flex flex-col gap-2 rounded-xl bg-zinc-900 p-3">
          <a href={`https://www.youtube.com/watch?v=${selected.id}`} target="_blank" rel="noreferrer" className="text-sm text-sky-400 underline">
            Écouter sur YouTube pour trouver le bon moment
          </a>
          <label className="flex items-center gap-3">
            <span className="flex-1">Début de l&apos;extrait ({EXCERPT} s)</span>
            <input
              value={startText}
              onChange={(e) => setStartText(e.target.value)}
              inputMode="numeric"
              placeholder="1:23"
              className="w-24 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-center text-base"
            />
          </label>
          <button type="button" onClick={useExcerpt} disabled={busy !== null} className="min-h-12 rounded-xl bg-white font-semibold text-black disabled:opacity-50">
            {busy === "audio" ? "Récupération de l'extrait…" : "Utiliser cet extrait"}
          </button>
        </div>
      )}
    </div>
  );
}
