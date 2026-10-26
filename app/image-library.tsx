"use client";

import { useEffect, useState } from "react";
import { removeImage } from "./image-actions";
import { ui } from "./ui";

export type LibraryImage = { id: string; url: string };

/**
 * Bibliothèque d'images, en panneau qui monte du bas : les photos déjà utilisées, la dernière en
 * premier. Toucher une image la choisit ; « Gérer » permet d'en retirer.
 */
export default function ImageLibrary({ onPick, onClose }: { onPick: (image: LibraryImage) => void; onClose: () => void }) {
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);

  useEffect(() => {
    fetch("/api/images", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { images?: LibraryImage[]; error?: string };
        if (!res.ok || !data.images) throw new Error(data.error ?? `Erreur du serveur (${res.status}).`);
        setImages(data.images);
      })
      .catch((e: unknown) => setError(e instanceof TypeError ? "Connexion impossible. Vérifie ton réseau." : (e as Error).message));
  }, []);

  async function remove(image: LibraryImage) {
    if (!window.confirm("Retirer cette image de la bibliothèque ? Les vidéos déjà créées ne changent pas.")) return;
    try {
      await removeImage(image.id);
      setImages((list) => list?.filter((i) => i.id !== image.id) ?? null);
    } catch {
      setError("Le retrait a échoué. Vérifie ta connexion.");
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Bibliothèque d'images" className="fixed inset-0 z-30 flex items-end bg-black/70" onClick={onClose}>
      <div
        className="mx-auto flex max-h-[85vh] w-full max-w-md flex-col gap-4 rounded-t-3xl bg-zinc-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Bibliothèque</h2>
          <div className="flex gap-2">
            {images && images.length > 0 && (
              <button type="button" onClick={() => setManaging((m) => !m)} className={ui.secondary}>
                {managing ? "Terminé" : "Gérer"}
              </button>
            )}
            <button type="button" onClick={onClose} className={ui.secondary}>Fermer</button>
          </div>
        </div>

        {error && <p role="alert" className={ui.error}>{error}</p>}
        {!images && !error && <p className={ui.hint}>Chargement…</p>}
        {images?.length === 0 && (
          <p className={ui.hint}>Vide pour l&apos;instant : chaque photo utilisée pour une vidéo s&apos;ajoute ici automatiquement.</p>
        )}

        {images && images.length > 0 && (
          <ul className="grid grid-cols-3 gap-1 overflow-y-auto">
            {images.map((image) => (
              <li key={image.id} className="relative">
                <button
                  type="button"
                  onClick={() => (managing ? remove(image) : onPick(image))}
                  aria-label={managing ? "Retirer cette image" : "Choisir cette image"}
                  className="block aspect-square w-full overflow-hidden rounded-lg bg-zinc-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
                {managing && (
                  <span aria-hidden className="pointer-events-none absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-sm font-bold">
                    ✕
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
