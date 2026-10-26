"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  BRANDED_CONTENT_URL,
  disclosureLabel,
  MUSIC_USAGE_URL,
  PRIVACY_LABELS,
  type CreatorInfo,
  type TikTokOptions,
} from "@/lib/tiktok-options";
import { saveTikTokSettings } from "./publiees/actions";
import { ui } from "./ui";

/*
 * Publication TikTok, selon les règles d'interface de TikTok (content-sharing-guidelines) :
 * - TikTokSettingsForm (page Publiées) : visibilité et interactions, choisies une fois par Victor ;
 * - TikTokPublishFields (au moment de publier) : compte, rappel des réglages, déclaration de
 *   contenu commercial (propre à chaque vidéo), accord sur l'utilisation de la musique.
 * Les infos du compte (creator_info) sont relues à chaque affichage, comme l'exige TikTok.
 */

/** Infos du compte TikTok, relues à l'affichage. */
function useCreatorInfo(onCreator?: (creator: CreatorInfo | null) => void) {
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
      onCreator?.(data.creator);
    } catch (e) {
      setCreator(null);
      onCreator?.(null);
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

  return { creator, error, loading, reload: load };
}

function CreatorState({ loading, error, reload }: { loading: boolean; error: string | null; reload: () => void }) {
  if (loading) return <p className="text-sm text-zinc-400">Lecture de ton compte TikTok…</p>;
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-red-950 px-3 py-2 text-sm text-red-200">
      <p>{error ?? "Impossible de lire ton compte TikTok."}</p>
      <button type="button" onClick={reload} className="min-h-11 self-start rounded-lg bg-red-900 px-3">Réessayer</button>
    </div>
  );
}

/** Réglages de publication TikTok du compte (page Publiées). */
export function TikTokSettingsForm({ initial }: { initial: TikTokOptions }) {
  const { creator, error, loading, reload } = useCreatorInfo();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  if (!creator) return <CreatorState loading={loading} error={error} reload={reload} />;

  const set = (patch: Partial<TikTokOptions>) => {
    setValue((v) => ({ ...v, ...patch }));
    setMessage(null);
  };

  function save() {
    startSaving(async () => {
      try {
        const err = await saveTikTokSettings(value);
        if (err) setMessage({ ok: false, text: err });
        else {
          setSaved(value);
          setMessage({ ok: true, text: "Réglages enregistrés ✓" });
        }
      } catch {
        setMessage({ ok: false, text: "L'enregistrement a échoué. Vérifie ta connexion." });
      }
    });
  }

  const interaction = (key: "allowComment" | "allowDuet" | "allowStitch", text: string, disabled: boolean) => (
    <label className={`flex min-h-11 items-center justify-between gap-3 ${disabled ? "opacity-50" : ""}`}>
      <span>
        {text}
        {disabled && <span className="text-zinc-500"> (désactivé dans ton compte TikTok)</span>}
      </span>
      <input type="checkbox" checked={value[key] && !disabled} disabled={disabled} onChange={(e) => set({ [key]: e.target.checked })} className="h-6 w-6 accent-white" />
    </label>
  );
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span>Qui peut voir tes vidéos</span>
        <select value={value.privacyLevel} onChange={(e) => set({ privacyLevel: e.target.value })} className={ui.field}>
          <option value="" disabled>Choisir…</option>
          {creator.privacyOptions.map((p) => (
            <option key={p} value={p}>{PRIVACY_LABELS[p] ?? p}</option>
          ))}
        </select>
      </label>
      {interaction("allowComment", "Autoriser les commentaires", creator.commentDisabled)}
      {interaction("allowDuet", "Autoriser les duos", creator.duetDisabled)}
      {interaction("allowStitch", "Autoriser les collages (Stitch)", creator.stitchDisabled)}
      {message && <p role="status" className={message.ok ? ui.ok : ui.error}>{message.text}</p>}
      <button type="button" onClick={save} disabled={saving || !dirty} className={ui.secondary}>
        {saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistré"}
      </button>
    </div>
  );
}

type PublishProps = {
  value: TikTokOptions;
  onChange: (value: TikTokOptions) => void;
  /** Infos du compte, remontées au parent pour valider avant de publier (null tant qu'inconnues). */
  onCreator: (creator: CreatorInfo | null) => void;
};

/** Au moment de publier : compte, rappel des réglages, contenu commercial, accord musique. */
export default function TikTokPublishFields({ value, onChange, onCreator }: PublishProps) {
  const { creator, error, loading, reload } = useCreatorInfo(onCreator);
  if (!creator) return <CreatorState loading={loading} error={error} reload={reload} />;

  const set = (patch: Partial<TikTokOptions>) => onChange({ ...value, ...patch });
  const branded = value.disclose && value.brandedContent;
  const label = disclosureLabel(value);
  const allowed = [
    value.allowComment && !creator.commentDisabled && "commentaires",
    value.allowDuet && !creator.duetDisabled && "duos",
    value.allowStitch && !creator.stitchDisabled && "collages",
  ].filter(Boolean);
  const privacyOk = Boolean(value.privacyLevel) && creator.privacyOptions.includes(value.privacyLevel);

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-zinc-950 p-3 text-sm">
      <p className="text-zinc-300">
        Compte TikTok : <span className="font-semibold text-foreground">{creator.nickname}</span>
        {creator.username ? <span className="text-zinc-500"> (@{creator.username})</span> : null}
      </p>
      {privacyOk ? (
        <p className="text-zinc-300">
          {PRIVACY_LABELS[value.privacyLevel] ?? value.privacyLevel} · {allowed.length ? `${allowed.join(", ")} autorisés` : "aucune interaction"}
          {" · "}
          <Link href="/publiees" className={ui.link}>modifier</Link>
        </p>
      ) : (
        <p className="text-amber-200">
          Choisis d&apos;abord qui peut voir tes vidéos :{" "}
          <Link href="/publiees" className={ui.link}>Publiées → Réglages TikTok</Link>.
        </p>
      )}

      <label className="flex min-h-11 items-center justify-between gap-3">
        <span>Contenu commercial (pour cette vidéo)</span>
        <input
          type="checkbox"
          checked={value.disclose}
          onChange={(e) => set({ disclose: e.target.checked, yourBrand: false, brandedContent: false })}
          className="h-6 w-6 accent-white"
        />
      </label>
      {value.disclose && (
        <div className="flex flex-col gap-2 border-l-2 border-zinc-700 pl-3">
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span>
              Ta marque <span className="text-zinc-500">(tu fais ta propre promotion)</span>
            </span>
            <input type="checkbox" checked={value.yourBrand} onChange={(e) => set({ yourBrand: e.target.checked })} className="h-6 w-6 accent-white" />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3">
            <span>
              Contenu de marque <span className="text-zinc-500">(partenariat rémunéré)</span>
            </span>
            <input type="checkbox" checked={value.brandedContent} onChange={(e) => set({ brandedContent: e.target.checked })} className="h-6 w-6 accent-white" />
          </label>
          {label ? (
            <p className="text-zinc-300">{label}</p>
          ) : (
            <p className="text-amber-200">Indique si la vidéo fait ta promotion, celle d&apos;un tiers, ou les deux.</p>
          )}
          {branded && value.privacyLevel === "SELF_ONLY" && (
            <p className="text-amber-200">Un contenu de marque ne peut pas être en « Moi uniquement » : change la visibilité dans Publiées.</p>
          )}
        </div>
      )}

      <p className="text-zinc-400">
        {branded ? (
          <>
            En publiant, tu acceptes la{" "}
            <a href={BRANDED_CONTENT_URL} target="_blank" rel="noreferrer" className={ui.link}>politique de TikTok sur le contenu de marque</a>{" "}
            et la{" "}
          </>
        ) : (
          "En publiant, tu acceptes la "
        )}
        <a href={MUSIC_USAGE_URL} target="_blank" rel="noreferrer" className={ui.link}>confirmation d&apos;utilisation de la musique de TikTok</a>.
      </p>
      <p className="text-xs text-zinc-500">
        TikTok peut mettre quelques minutes avant d&apos;afficher la vidéo. Tant que l&apos;app n&apos;est pas auditée par TikTok, la vidéo reste privée.
      </p>
    </div>
  );
}
