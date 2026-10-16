"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteVideo, renameVideo } from "../actions";

type Props = { id: string; title: string; placeholder: string; downloadUrl: string; name: string };

/** Renommer, télécharger et supprimer une vidéo. */
export default function VideoActions({ id, title, placeholder, downloadUrl, name }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(title);
  const [saved, setSaved] = useState(title);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();

  function rename(e: React.FormEvent) {
    e.preventDefault();
    startSaving(async () => {
      try {
        const error = await renameVideo(id, value);
        if (error) setMessage({ ok: false, text: error });
        else {
          setSaved(value.trim());
          setValue(value.trim());
          setMessage({ ok: true, text: "Nom enregistré ✓" });
        }
      } catch {
        setMessage({ ok: false, text: "L'enregistrement a échoué. Vérifie ta connexion." });
      }
    });
  }

  function remove() {
    const ok = window.confirm(
      `Supprimer « ${name} » ? La vidéo et ses fichiers seront effacés du site. Rien n'est supprimé sur Instagram ni TikTok.`,
    );
    if (!ok) return;
    startDeleting(async () => {
      try {
        const error = await deleteVideo(id);
        if (error) setMessage({ ok: false, text: error });
        else router.push("/videos");
      } catch {
        setMessage({ ok: false, text: "La suppression a échoué. Vérifie ta connexion." });
      }
    });
  }

  const button = "rounded-xl px-4 py-3 text-base font-semibold disabled:opacity-50";

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={rename} className="flex flex-col gap-2">
        <label htmlFor="title" className="font-semibold">Nom</label>
        <div className="flex gap-2">
          <input
            id="title"
            value={value}
            maxLength={80}
            placeholder={placeholder}
            onChange={(e) => { setValue(e.target.value); setMessage(null); }}
            className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-base"
          />
          <button type="submit" disabled={saving || value.trim() === saved} className={`${button} bg-white text-black`}>
            {saving ? "…" : "OK"}
          </button>
        </div>
      </form>
      {message && (
        <p role="status" className={`rounded-xl px-4 py-3 ${message.ok ? "bg-green-950 text-green-200" : "bg-red-950 text-red-200"}`}>
          {message.text}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <a href={downloadUrl} className={`${button} bg-zinc-800 text-center`}>Télécharger</a>
        <button type="button" onClick={remove} disabled={deleting} className={`${button} bg-red-950 text-red-200`}>
          {deleting ? "Suppression…" : "Supprimer"}
        </button>
      </div>
    </div>
  );
}
