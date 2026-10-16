"use client";

import { useState } from "react";

/** Durées d'extrait proposées, en secondes (90 s = durée max d'une vidéo). */
export const LENGTHS = [15, 30, 45, 60, 90];

export function formatTime(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** Champ vide = 0 ; on ne garde que les chiffres (clavier numérique du téléphone). */
function digits(value: string, max: number) {
  const n = value.replace(/\D/g, "").slice(0, 3);
  return n === "" ? "" : String(Math.min(max, Number(n)));
}

export type Excerpt = { start: number; length: number };

/**
 * Début (minutes + secondes, clavier numérique) et durée d'un extrait de son.
 * La vidéo dure exactement la durée de l'extrait, qui commence avec elle.
 */
export default function ExcerptFields({ value, onChange }: { value: Excerpt; onChange: (v: Excerpt) => void }) {
  // Champs texte locaux pour pouvoir les vider pendant la saisie (vide = 0).
  const [minutes, setMinutes] = useState(value.start >= 60 ? String(Math.floor(value.start / 60)) : "");
  const [seconds, setSeconds] = useState(value.start % 60 ? String(Math.floor(value.start % 60)) : "");

  function setStart(m: string, s: string) {
    setMinutes(m);
    setSeconds(s);
    onChange({ ...value, start: Number(m || 0) * 60 + Number(s || 0) });
  }

  const field = "w-16 rounded-xl border border-zinc-700 bg-zinc-950 px-2 py-3 text-center text-base";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span>Début de l&apos;extrait</span>
        <div className="flex items-center gap-2">
          <input value={minutes} onChange={(e) => setStart(digits(e.target.value, 999), seconds)} inputMode="numeric" placeholder="0" aria-label="Minutes" className={field} />
          <span>min</span>
          <input value={seconds} onChange={(e) => setStart(minutes, digits(e.target.value, 59))} inputMode="numeric" placeholder="0" aria-label="Secondes" className={field} />
          <span>s</span>
          <span className="ml-auto text-sm text-zinc-400">= {formatTime(value.start)}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span>Durée (= durée de la vidéo)</span>
        <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="Durée de l'extrait">
          {LENGTHS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={value.length === l}
              onClick={() => onChange({ ...value, length: l })}
              className={`min-h-11 rounded-lg text-sm font-semibold ${value.length === l ? "bg-white text-black" : "bg-zinc-800"}`}
            >
              {l} s
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
