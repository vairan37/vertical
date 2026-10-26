"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BRANDED_CONTENT_URL,
  disclosureLabel,
  MUSIC_USAGE_URL,
  PRIVACY_LABELS,
  type CreatorInfo,
  type TikTokOptions,
} from "@/lib/tiktok-options";
import { ui } from "./ui";

type Props = {
  value: TikTokOptions;
  onChange: (value: TikTokOptions) => void;
  /** Infos du compte, remontées au parent pour valider avant de publier (null tant qu'inconnues). */
  onCreator: (creator: CreatorInfo | null) => void;
};

/**
 * Réglages d'une publication TikTok, conformes aux règles d'interface de TikTok (audit) :
 * compte affiché, visibilité sans valeur par défaut, interactions décochées par défaut et grisées
 * si coupées dans le compte, déclaration de contenu commercial, accord musique avant publication.
 */
export default function TikTokFields({ value, onChange, onCreator }: Props) {
  const [creator, setCreator] = useState<CreatorInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/social/tiktok/creator", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { creator?: CreatorInfo; error?: string };
      if (!res.ok || !data.creator) throw new Error(data.error ?? `Erreur du serveur (${res.status}).`);
      setCreator(data.creator);
      onCreator(data.creator);
    } catch (e) {
      setCreator(null);
      onCreator(null);
      setError(e instanceof TypeError ? "Connexion impossible. Vérifie ton réseau." : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onCreator]);

  useEffect(() => {
    // Chargement des infos du compte à l'affichage (setState asynchrone, après la réponse).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const set = (patch: Partial<TikTokOptions>) => onChange({ ...value, ...patch });

  if (loading) return <p className="text-sm text-zinc-400">Lecture de ton compte TikTok…</p>;
  if (error || !creator) {
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-red-950 px-3 py-2 text-sm text-red-200">
        <p>{error ?? "Impossible de lire ton compte TikTok."}</p>
        <button type="button" onClick={load} className="min-h-11 self-start rounded-lg bg-red-900 px-3">Réessayer</button>
      </div>
    );
  }

  const branded = value.disclose && value.brandedContent;
  const label = disclosureLabel(value);
  const interaction = (key: "allowComment" | "allowDuet" | "allowStitch", text: string, disabled: boolean) => (
    <label className={`flex min-h-11 items-center justify-between gap-3 ${disabled ? "opacity-50" : ""}`}>
      <span>
        {text}
        {disabled && <span className="text-sm text-zinc-500"> (désactivé dans ton compte TikTok)</span>}
      </span>
      <input
        type="checkbox"
        checked={value[key] && !disabled}
        disabled={disabled}
        onChange={(e) => set({ [key]: e.target.checked })}
        className="h-6 w-6"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-zinc-950 p-3 text-sm">
      <p className="text-sm text-zinc-300">
        Compte TikTok : <span className="font-semibold text-foreground">{creator.nickname}</span>
        {creator.username ? <span className="text-zinc-500"> (@{creator.username})</span> : null}
      </p>

      <label className="flex flex-col gap-1">
        <span>Qui peut voir cette vidéo</span>
        <select
          value={value.privacyLevel}
          onChange={(e) => set({ privacyLevel: e.target.value })}
          className={ui.field}
        >
          <option value="" disabled>Choisir…</option>
          {creator.privacyOptions.map((p) => (
            <option key={p} value={p} disabled={branded && p === "SELF_ONLY"}>
              {PRIVACY_LABELS[p] ?? p}
              {branded && p === "SELF_ONLY" ? " (impossible pour un contenu de marque)" : ""}
            </option>
          ))}
        </select>
      </label>

      {interaction("allowComment", "Autoriser les commentaires", creator.commentDisabled)}
      {interaction("allowDuet", "Autoriser les duos", creator.duetDisabled)}
      {interaction("allowStitch", "Autoriser les collages (Stitch)", creator.stitchDisabled)}

      <label className="flex min-h-11 items-center justify-between gap-3">
        <span>Déclarer un contenu commercial</span>
        <input
          type="checkbox"
          checked={value.disclose}
          onChange={(e) => set({ disclose: e.target.checked, yourBrand: false, brandedContent: false })}
          className="h-6 w-6"
        />
      </label>
      {value.disclose && (
        <div className="flex flex-col gap-2 border-l-2 border-zinc-700 pl-3">
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span>
              Ta marque <span className="text-sm text-zinc-500">(tu fais ta propre promotion)</span>
            </span>
            <input type="checkbox" checked={value.yourBrand} onChange={(e) => set({ yourBrand: e.target.checked })} className="h-6 w-6" />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span>
              Contenu de marque <span className="text-sm text-zinc-500">(partenariat rémunéré avec un tiers)</span>
            </span>
            <input
              type="checkbox"
              checked={value.brandedContent}
              onChange={(e) =>
                // Contenu de marque : jamais en « Moi uniquement » (règle TikTok).
                set({
                  brandedContent: e.target.checked,
                  privacyLevel: e.target.checked && value.privacyLevel === "SELF_ONLY" ? "" : value.privacyLevel,
                })
              }
              className="h-6 w-6"
            />
          </label>
          {label ? (
            <p className="text-sm text-zinc-300">{label}</p>
          ) : (
            <p className="text-sm text-amber-200">Indique si la vidéo fait ta promotion, celle d&apos;un tiers, ou les deux.</p>
          )}
        </div>
      )}

      <p className="text-sm text-zinc-400">
        {branded ? (
          <>
            En publiant, tu acceptes la{" "}
            <a href={BRANDED_CONTENT_URL} target="_blank" rel="noreferrer" className="text-sky-400 underline">
              politique de TikTok sur le contenu de marque
            </a>{" "}
            et la{" "}
          </>
        ) : (
          "En publiant, tu acceptes la "
        )}
        <a href={MUSIC_USAGE_URL} target="_blank" rel="noreferrer" className="text-sky-400 underline">
          confirmation d&apos;utilisation de la musique de TikTok
        </a>
        .
      </p>
      <p className="text-xs text-zinc-500">
        Après l&apos;envoi, TikTok peut mettre quelques minutes avant d&apos;afficher la vidéo sur ton profil.
        Tant que l&apos;app n&apos;est pas auditée par TikTok, la vidéo reste privée.
      </p>
    </div>
  );
}
