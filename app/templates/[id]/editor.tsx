"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { previewUrl, SAMPLE_TEXT } from "@/lib/template-preview";
import {
  FONTS,
  IMAGE_FITS,
  LIMITS,
  type FontId,
  type ImageFit,
  type TemplateSettings,
} from "@/lib/template-settings";
import { deleteTemplate, updateTemplate } from "../actions";

type Props = { id: string; initialName: string; initialSettings: TemplateSettings };

/** Retarde une valeur : l'aperçu n'est recalculé qu'une fois le curseur relâché un instant. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function Editor({ id, initialName, initialSettings }: Props) {
  const [name, setName] = useState(initialName);
  const [settings, setSettings] = useState(initialSettings);
  const [saved, setSaved] = useState({ name: initialName, settings: initialSettings });
  const [sample, setSample] = useState(SAMPLE_TEXT);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const router = useRouter();

  const previewSrc = previewUrl(useDebounced(settings, 350), useDebounced(sample, 350));
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const dirty = name !== saved.name || JSON.stringify(settings) !== JSON.stringify(saved.settings);

  function set<K extends keyof TemplateSettings>(key: K, value: TemplateSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
    setMessage(null);
  }

  function save() {
    startSaving(async () => {
      try {
        const error = await updateTemplate(id, name, settings);
        if (error) setMessage({ ok: false, text: error });
        else {
          setSaved({ name, settings });
          setMessage({ ok: true, text: "Template enregistrée ✓" });
        }
      } catch {
        setMessage({ ok: false, text: "L'enregistrement a échoué. Vérifie ta connexion." });
      }
    });
  }

  function remove() {
    if (!window.confirm(`Supprimer la template « ${name} » ? Les vidéos déjà créées sont conservées.`)) return;
    startDeleting(async () => {
      try {
        const error = await deleteTemplate(id);
        if (error) setMessage({ ok: false, text: error });
        else router.push("/templates");
      } catch {
        setMessage({ ok: false, text: "La suppression a échoué. Vérifie ta connexion." });
      }
    });
  }

  const input = "w-full rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-base";
  const button = "w-full rounded-xl px-4 py-4 text-base font-semibold disabled:opacity-50";

  const slider = (key: "textY" | "textSize" | "imageY" | "imageScale", label: string, unit: string) => (
    <label className="flex flex-col gap-1">
      <span>
        {label} : {settings[key]} {unit}
      </span>
      <input
        type="range"
        min={LIMITS[key].min}
        max={LIMITS[key].max}
        value={settings[key]}
        onChange={(e) => set(key, Number(e.target.value))}
        className="h-10"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      <label className="flex flex-col gap-2">
        <span className="font-semibold">Nom</span>
        <input value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setMessage(null); }} className={input} />
      </label>

      <div className="sticky top-14 z-[5] -mx-4 flex justify-center bg-background/95 px-4 py-2 backdrop-blur">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewSrc}
          alt="Aperçu de la template"
          onLoad={() => setLoadedSrc(previewSrc)}
          className={`aspect-[9/16] w-28 rounded-xl bg-black object-cover transition-opacity ${loadedSrc === previewSrc ? "" : "opacity-60"}`}
        />
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-sm text-zinc-400">Texte d&apos;exemple (pour l&apos;aperçu, non enregistré)</span>
        <input value={sample} maxLength={300} onChange={(e) => setSample(e.target.value)} className={input} />
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">Texte</legend>
        {slider("textY", "Position verticale", "%")}
        {slider("textSize", "Taille", "px")}
        <label className="flex flex-col gap-1">
          <span>Police</span>
          <select value={settings.font} onChange={(e) => set("font", e.target.value as FontId)} className={input}>
            {(Object.keys(FONTS) as FontId[]).map((f) => (
              <option key={f} value={f}>{FONTS[f].label}</option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span>Couleur du texte</span>
          <input type="color" value={settings.textColor} onChange={(e) => set("textColor", e.target.value)} className="h-11 w-16 rounded-lg bg-transparent" />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">Image</legend>
        <div className="flex flex-col gap-2">
          <span>Cadrage</span>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {(Object.keys(IMAGE_FITS) as ImageFit[]).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={settings.imageFit === f}
                onClick={() => set("imageFit", f)}
                className={`min-h-12 rounded-xl px-2 text-sm font-semibold ${settings.imageFit === f ? "bg-white text-black" : "bg-zinc-800"}`}
              >
                {IMAGE_FITS[f].label}
              </button>
            ))}
          </div>
          <p className="text-sm text-zinc-400">{IMAGE_FITS[settings.imageFit].hint}</p>
        </div>
        {slider("imageScale", "Taille", "%")}
        {slider("imageY", "Position verticale", "%")}
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span>Couleur du fond (bandes)</span>
          <input type="color" value={settings.backgroundColor} onChange={(e) => set("backgroundColor", e.target.value)} className="h-11 w-16 rounded-lg bg-transparent" />
        </label>
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span>Assombrir l&apos;image (lisibilité du texte)</span>
          <input type="checkbox" checked={settings.darken} onChange={(e) => set("darken", e.target.checked)} className="h-6 w-6" />
        </label>
      </fieldset>

      {message && (
        <p role="status" className={`rounded-xl px-4 py-3 ${message.ok ? "bg-green-950 text-green-200" : "bg-red-950 text-red-200"}`}>
          {message.text}
        </p>
      )}

      <button type="button" onClick={save} disabled={saving || !dirty} className={`${button} bg-white text-black`}>
        {saving ? "Enregistrement…" : dirty ? "Enregistrer" : "Enregistrée"}
      </button>
      <button type="button" onClick={remove} disabled={deleting} className={`${button} bg-red-950 text-red-200`}>
        {deleting ? "Suppression…" : "Supprimer la template"}
      </button>
    </div>
  );
}
