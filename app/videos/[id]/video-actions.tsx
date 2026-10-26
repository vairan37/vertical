"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteVideo, renameVideo } from "../actions";
import { ui } from "../../ui";

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


  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={rename} className="flex flex-col gap-2">
        <label htmlFor="title" className="text-sm text-zinc-400">Nom dans Mes vidéos</label>
        <div className="flex gap-2">
          <input
            id="title"
            value={value}
            maxLength={80}
            placeholder={placeholder}
            onChange={(e) => { setValue(e.target.value); setMessage(null); }}
            className={`${ui.field} min-w-0 flex-1`}
          />
          <button type="submit" disabled={saving || value.trim() === saved} className={ui.secondary}>
            {saving ? "…" : "OK"}
          </button>
        </div>
      </form>
      {message && (
        <p role="status" className={message.ok ? ui.ok : ui.error}>
          {message.text}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <a href={downloadUrl} className={ui.secondary}>Télécharger</a>
        <button type="button" onClick={remove} disabled={deleting} className={ui.danger}>
          {deleting ? "Suppression…" : "Supprimer"}
        </button>
      </div>
    </div>
  );
}
