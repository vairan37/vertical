"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import YoutubePicker from "./youtube-picker";

const MAX_IMAGE_SIDE = 2000;
const MAX_TEXT_LENGTH = 300;
const MAX_MUSIC_BYTES = 3 * 1024 * 1024;
const MIN_DURATION = 3;
const MAX_DURATION = 90;

/** Réduit l'image à 2000 px max et la convertit en JPEG (limite de ~4,5 Mo des requêtes Vercel). */
async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.9),
  );
}

const noop = () => () => {};

function canShareVideo() {
  try {
    return "canShare" in navigator && navigator.canShare({ files: [new File([], "v.mp4", { type: "video/mp4" })] });
  } catch {
    return false;
  }
}

/** Délai max d'attente du serveur avant d'abandonner. */
const RENDER_TIMEOUT_MS = 90_000;

function labelFor(name: string) {
  return name.replace(/\.mp3$/i, "").replace(/[-_]+/g, " ");
}

export type TemplateOption = { id: string; name: string };

export default function Creator({ templates }: { templates: TemplateOption[] }) {
  const [image, setImage] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [library, setLibrary] = useState<string[]>([]);
  const [music, setMusic] = useState("");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [start, setStart] = useState(0);
  const [duration, setDuration] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<{ id: string; url: string; downloadUrl: string } | null>(null);
  // Copie locale de la vidéo, préchargée pour que « Partager » réponde immédiatement
  // (iOS refuse le partage s'il y a un téléchargement entre le toucher et l'appel).
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [musicFileUrl, setMusicFileUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const videoRef = useRef<HTMLElement>(null);

  // Affiche toute erreur JavaScript inattendue au lieu d'échouer en silence.
  useEffect(() => {
    const onError = (e: ErrorEvent) => setError(`Erreur inattendue : ${e.message}`);
    const onRejection = (e: PromiseRejectionEvent) =>
      setError(`Erreur inattendue : ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Compteur affiché pendant la création.
  useEffect(() => {
    if (!busy) return;
    const startedAt = Date.now();
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [busy]);

  // Sur téléphone, le résultat apparaît sous le bouton : on le fait défiler à l'écran.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);
  useEffect(() => {
    if (video) videoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [video]);

  useEffect(() => {
    fetch("/api/music")
      .then((r) => r.json())
      .then((d: { music: string[] }) => {
        setLibrary(d.music);
        setMusic((m) => m || d.music[0] || "");
      })
      .catch(() => setError("Impossible de charger la liste des musiques."));
  }, []);

  // Libère les URL locales quand elles changent.
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
  useEffect(() => () => { if (musicFileUrl) URL.revokeObjectURL(musicFileUrl); }, [musicFileUrl]);

  const audioSrc = musicFileUrl ?? (music ? `/music/${encodeURIComponent(music)}` : undefined);

  async function onImage(file: File | undefined) {
    setError(null);
    if (!file) return;
    try {
      const resized = await resizeImage(file);
      setImage(resized);
      setImageUrl(URL.createObjectURL(resized));
    } catch {
      setError("Cette image n'a pas pu être lue. Essaie une photo JPEG ou PNG.");
    }
  }

  function onMusicFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > MAX_MUSIC_BYTES) {
      setError("La musique est trop lourde (3 Mo maximum).");
      return;
    }
    setMusicFile(file);
    setMusicFileUrl(URL.createObjectURL(file));
  }

  /** Extrait YouTube : il commence déjà au bon moment (départ à 0) et fixe la durée de la vidéo. */
  function onYoutubeExcerpt(file: File, length: number) {
    onMusicFile(file);
    setStart(0);
    setDuration(Math.min(MAX_DURATION, Math.max(MIN_DURATION, length)));
  }

  function clearMusicFile() {
    setMusicFile(null);
    setMusicFileUrl(null);
  }

  const stopTimer = useRef<number | undefined>(undefined);

  /** Joue l'extrait (départ + durée). Le déplacement attend le chargement : sinon iOS l'ignore. */
  function listen() {
    const audio = audioRef.current;
    if (!audio) return;
    window.clearTimeout(stopTimer.current);
    const play = () => {
      audio.currentTime = start;
      audio.play().then(
        () => { stopTimer.current = window.setTimeout(() => audio.pause(), duration * 1000); },
        () => setError("La lecture de l'extrait a échoué sur cet appareil."),
      );
    };
    if (audio.readyState >= 1) play();
    else {
      audio.addEventListener("loadedmetadata", play, { once: true });
      audio.load();
    }
  }

  async function create() {
    setError(null);
    if (!image) return setError("Choisis une image.");
    if (!musicFile && !music) return setError("Choisis une musique.");
    setElapsed(0);
    setBusy(true);
    setVideo(null);
    setVideoBlob(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
    try {
      const form = new FormData();
      form.set("image", image, "image.jpg");
      form.set("text", text);
      form.set("title", title);
      if (templateId) form.set("templateId", templateId);
      form.set("start", String(start));
      form.set("duration", String(duration));
      if (musicFile) form.set("musicFile", musicFile);
      else form.set("music", music);
      const res = await fetch("/api/render", { method: "POST", body: form, signal: controller.signal });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Erreur du serveur (${res.status}).`);
      }
      const data = (await res.json()) as { id: string; videoUrl: string; downloadUrl: string };
      setVideo({ id: data.id, url: data.videoUrl, downloadUrl: data.downloadUrl });
      fetch(data.videoUrl)
        .then((r) => (r.ok ? r.blob() : null))
        .then(setVideoBlob)
        .catch(() => setVideoBlob(null));
    } catch (e) {
      if (controller.signal.aborted) setError("Le serveur met trop de temps à répondre. Réessaie.");
      else if (e instanceof TypeError) setError("Connexion impossible. Vérifie ton réseau.");
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  async function share() {
    if (!videoBlob) return;
    const file = new File([videoBlob], "vertical.mp4", { type: "video/mp4" });
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Le partage n'est pas disponible sur cet appareil.");
    }
  }

  // Lu uniquement côté client (false au rendu serveur) pour éviter un écart d'hydratation.
  const canShare = useSyncExternalStore(noop, canShareVideo, () => false);

  const input = "w-full rounded-xl bg-zinc-900 border border-zinc-700 px-4 py-3 text-base";
  const button = "w-full rounded-xl px-4 py-4 text-base font-semibold disabled:opacity-50";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <label className="font-semibold" htmlFor="image">Image</label>
        <label
          htmlFor="image"
          className="flex aspect-[9/16] w-40 cursor-pointer items-center justify-center self-center overflow-hidden rounded-xl border border-dashed border-zinc-600 bg-zinc-900 text-center text-sm text-zinc-400"
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="Image choisie" className="h-full w-full object-cover" />
          ) : (
            "Touche pour choisir une photo"
          )}
        </label>
        <input id="image" type="file" accept="image/*" className="sr-only" onChange={(e) => onImage(e.target.files?.[0])} />
      </section>

      <section className="flex flex-col gap-2">
        <label className="font-semibold" htmlFor="title">Nom <span className="font-normal text-zinc-500">(optionnel, visible dans Mes vidéos)</span></label>
        <input id="title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className={input} placeholder="Par défaut : le texte de la vidéo" />
      </section>

      {templates.length > 0 && (
        <section className="flex flex-col gap-2">
          <label className="font-semibold" htmlFor="template">Template</label>
          <select id="template" value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={input}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <label className="font-semibold" htmlFor="text">Texte</label>
        <textarea
          id="text"
          rows={3}
          maxLength={MAX_TEXT_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={input}
          placeholder="Le texte affiché sur la vidéo"
        />
        <span className="self-end text-sm text-zinc-500">{text.length}/{MAX_TEXT_LENGTH}</span>
      </section>

      <section className="flex flex-col gap-3">
        <label className="font-semibold" htmlFor="music">Musique</label>
        {musicFile ? (
          <div className="flex items-center gap-3">
            <span className="flex-1 truncate text-zinc-300">🎵 {musicFile.name}</span>
            <button type="button" onClick={clearMusicFile} className="rounded-xl bg-zinc-800 px-4 py-3">Retirer</button>
          </div>
        ) : (
          <select id="music" value={music} onChange={(e) => setMusic(e.target.value)} className={input}>
            {library.length === 0 && <option value="">Aucune musique disponible</option>}
            {library.map((m) => (
              <option key={m} value={m}>{labelFor(m)}</option>
            ))}
          </select>
        )}
        <label className="cursor-pointer text-center text-sm text-sky-400 underline">
          {musicFile ? "Choisir un autre fichier" : "ou envoyer un fichier audio (3 Mo max)"}
          <input type="file" accept="audio/*" className="sr-only" onChange={(e) => onMusicFile(e.target.files?.[0])} />
        </label>
        <YoutubePicker onPick={onYoutubeExcerpt} />

        <label className="flex flex-col gap-1">
          <span>Départ dans la musique : {start} s</span>
          <input type="range" min={0} max={180} step={1} value={start} onChange={(e) => setStart(Number(e.target.value))} className="h-10" />
        </label>
        <label className="flex flex-col gap-1">
          <span>Durée de la vidéo : {duration} s</span>
          <input type="range" min={MIN_DURATION} max={MAX_DURATION} step={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="h-10" />
        </label>
        <audio ref={audioRef} src={audioSrc} preload="metadata" />
        <button type="button" onClick={listen} disabled={!audioSrc} className={`${button} bg-zinc-800`}>
          Écouter l&apos;extrait
        </button>
      </section>

      {error && <p ref={errorRef} role="alert" className="rounded-xl bg-red-950 px-4 py-3 text-red-200">{error}</p>}

      <button type="button" onClick={create} disabled={busy} className={`${button} bg-white text-black`}>
        {busy ? `Création en cours… ${elapsed} s` : "Créer la vidéo"}
      </button>
      {busy && <p className="-mt-3 text-center text-sm text-zinc-400">Ça prend en général 5 à 20 secondes.</p>}

      {video && (
        <section ref={videoRef} className="flex flex-col gap-3">
          <p className="font-semibold text-green-400">Vidéo créée ✓</p>
          <video src={video.url} controls playsInline preload="metadata" className="aspect-[9/16] w-full rounded-xl bg-black" />
          <Link href="/videos" className={`${button} bg-white text-center text-black`}>
            Voir dans Mes vidéos
          </Link>
          <a href={video.downloadUrl} download="vertical.mp4" className={`${button} bg-zinc-800 text-center`}>
            Télécharger
          </a>
          {canShare && (
            <button type="button" onClick={share} disabled={!videoBlob} className={`${button} bg-zinc-800`}>
              {videoBlob ? "Partager" : "Préparation du partage…"}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
