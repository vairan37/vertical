"use client";

import { uploadPresigned } from "@vercel/blob/client";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_SETTINGS,
  imageBox,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  type TemplateSettings,
} from "@/lib/template-settings";
import ExcerptFields, { type Excerpt } from "./excerpt-fields";
import YoutubePicker, { type YoutubeChoice } from "./youtube-picker";

const MAX_IMAGE_SIDE = 2000;
const MAX_TEXT_LENGTH = 300;
const MAX_MUSIC_BYTES = 3 * 1024 * 1024;
const MIN_DURATION = 3;
const MAX_DURATION = 90;

/** Côté max de la copie légère envoyée pour l'aperçu (affiché en 540x960). */
const PREVIEW_IMAGE_SIDE = 1080;

/** Réduit l'image (2000 px max par défaut) et la convertit en JPEG (limite ~4,5 Mo des requêtes Vercel). */
async function resizeImage(file: Blob, maxSide = MAX_IMAGE_SIDE): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
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

/** Délai max d'attente du serveur avant d'abandonner (un clip vidéo peut prendre ~2 min). */
const RENDER_TIMEOUT_MS = 310_000;

const MAX_CLIP_BYTES = 200 * 1024 * 1024;
/** Illustrations animées acceptées (envoyées au stockage, rendues image par image). */
const CLIP_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "image/gif": "gif",
};

type Clip = {
  name: string;
  kind: "video" | "gif";
  /** URL locale (objet) du fichier, pour l'aperçu animé. */
  localUrl: string;
  width: number;
  height: number;
  /** Durée du clip en secondes (0 si inconnue, GIF) ; il tourne en boucle s'il est plus court. */
  duration: number;
  progress: number;
  /** URL dans le stockage une fois l'envoi terminé. */
  url: string | null;
  error: string | null;
};

type ClipMeta = { frame: Blob; duration: number; width: number; height: number };

/** Première image d'un GIF (en JPEG, pour l'aperçu exact) et ses dimensions. */
async function gifFrame(file: File): Promise<ClipMeta> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  bitmap.close();
  return { frame: await resizeImage(file, PREVIEW_IMAGE_SIDE), duration: 0, width, height };
}

/** Image d'un clip (à 0,5 s) en JPEG, pour l'aperçu, avec sa durée et ses dimensions. */
function clipFrame(file: File): Promise<ClipMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const done = (error?: Error) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      if (error) reject(error);
    };
    video.onerror = () => done(new Error("Cette vidéo n'a pas pu être lue sur cet appareil."));
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      const scale = Math.min(1, PREVIEW_IMAGE_SIDE / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const meta = { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
      canvas.toBlob((b) => {
        done(b ? undefined : new Error("Image du clip impossible à extraire."));
        if (b) resolve({ frame: b, ...meta });
      }, "image/jpeg", 0.85);
    };
    video.src = url;
  });
}

/** Durée des fondus simulés dans l'aperçu, en secondes (comme FADES.videoIn/Out du rendu). */
const FADE = 0.4;

function formatTime(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function labelFor(name: string) {
  return name.replace(/\.mp3$/i, "").replace(/[-_]+/g, " ");
}

export type TemplateOption = { id: string; name: string; settings: TemplateSettings };

/** Position d'une boîte de la vidéo (coordonnées 1080x1920) en % du cadre de l'aperçu. */
function boxStyle(box: { left: number; top: number; width: number; height: number }) {
  return {
    left: `${(box.left / VIDEO_WIDTH) * 100}%`,
    top: `${(box.top / VIDEO_HEIGHT) * 100}%`,
    width: `${(box.width / VIDEO_WIDTH) * 100}%`,
    height: `${(box.height / VIDEO_HEIGHT) * 100}%`,
  };
}

export default function Creator({ templates, blobUpload }: { templates: TemplateOption[]; blobUpload: boolean }) {
  const [image, setImage] = useState<Blob | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const [previewImage, setPreviewImage] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<{ url: string | null; loading: boolean; error: string | null }>({
    url: null,
    loading: true,
    error: null,
  });
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const settings = templates.find((t) => t.id === templateId)?.settings ?? DEFAULT_SETTINGS;
  const clipVideoRef = useRef<HTMLVideoElement>(null);
  const [library, setLibrary] = useState<string[]>([]);
  const [music, setMusic] = useState("");
  const [musicFile, setMusicFile] = useState<File | null>(null);
  // Extrait d'une musique de la bibliothèque ou d'un fichier envoyé (début + durée).
  const [excerpt, setExcerpt] = useState<Excerpt>({ start: 0, length: 15 });
  // Extrait YouTube : le fichier est déjà découpé ; on garde le choix pour pouvoir le modifier.
  const [ytChoice, setYtChoice] = useState<YoutubeChoice | null>(null);
  const [editingExcerpt, setEditingExcerpt] = useState(false);
  // Durée totale du son choisi (lue dans ses métadonnées), pour ne pas dépasser sa fin.
  const [audioTotal, setAudioTotal] = useState<number | null>(null);
  // Durée d'une vidéo sans son (seul cas où on la règle directement).
  const [silentDuration, setSilentDuration] = useState(8);
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
  const imageInputRef = useRef<HTMLInputElement>(null);
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
        // Pas de musique présélectionnée : sans choix, la vidéo est muette.
        setLibrary(d.music);
      })
      .catch(() => setError("Impossible de charger la liste des musiques."));
  }, []);

  // Aperçu exact (même rendu que la vidéo), recalculé 0,5 s après la dernière modification.
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreview((p) => ({ ...p, loading: true, error: null }));
      try {
        const form = new FormData();
        // Clip ou GIF : l'aperçu est composé ici (fond + clip qui joue + calque texte du serveur).
        if (clip) form.set("layer", "overlay");
        else if (previewImage) form.set("image", previewImage, "apercu.jpg");
        form.set("text", text);
        if (templateId) form.set("templateId", templateId);
        const res = await fetch("/api/preview", { method: "POST", body: form, signal: controller.signal });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "L'aperçu n'a pas pu être généré.");
        }
        const url = URL.createObjectURL(await res.blob());
        setPreview((p) => {
          if (p.url) URL.revokeObjectURL(p.url);
          return { url, loading: false, error: null };
        });
      } catch (e) {
        if (controller.signal.aborted) return;
        setPreview((p) => ({ ...p, loading: false, error: e instanceof Error && !(e instanceof TypeError) ? e.message : "Aperçu indisponible (connexion ?)." }));
      }
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // clip : seul « est-ce un clip ? » compte (coins arrondis), pas la progression de l'envoi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewImage, text, templateId, Boolean(clip)]);

  // Libère les URL locales quand elles changent.
  const clipLocalUrl = clip?.localUrl;
  useEffect(() => () => { if (clipLocalUrl) URL.revokeObjectURL(clipLocalUrl); }, [clipLocalUrl]);
  useEffect(() => () => { if (musicFileUrl) URL.revokeObjectURL(musicFileUrl); }, [musicFileUrl]);

  const audioSrc = musicFileUrl ?? (music ? `/music/${encodeURIComponent(music)}` : undefined);
  const hasAudio = Boolean(audioSrc);

  // La musique commence avec la vidéo, et la vidéo dure exactement l'extrait choisi
  // (raccourci si le son se termine avant).
  const clampDuration = (d: number) => Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.floor(d)));
  const start = ytChoice || !hasAudio ? 0 : excerpt.start;
  const duration = !hasAudio
    ? silentDuration
    : ytChoice
      ? clampDuration(Math.min(ytChoice.excerpt.length, (ytChoice.video.duration ?? Infinity) - ytChoice.excerpt.start))
      : clampDuration(Math.min(excerpt.length, audioTotal ? audioTotal - excerpt.start : Infinity));

  // Photo choisie avant la fin du chargement de la page (téléphone lent) : l'événement a été
  // perdu, on la reprend au démarrage.
  useEffect(() => {
    const file = imageInputRef.current?.files?.[0];
    if (file) void onImage(file);
    // Une seule fois, au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Envoie le clip directement au stockage (Vercel Blob), en suivant la progression. */
  async function uploadClip(file: File) {
    uploadAbort.current?.abort();
    const controller = new AbortController();
    uploadAbort.current = controller;
    const ext = CLIP_TYPES[file.type];
    try {
      let url: string;
      if (blobUpload) {
        const blob = await uploadPresigned(`sources/${crypto.randomUUID()}.${ext}`, file, {
          access: "public",
          handleUploadUrl: "/api/uploads",
          contentType: file.type,
          multipart: file.size > 8 * 1024 * 1024,
          abortSignal: controller.signal,
          onUploadProgress: ({ percentage }) =>
            setClip((c) => (c ? { ...c, progress: Math.round(percentage) } : c)),
        });
        url = blob.url;
      } else {
        // En local sans Blob : envoi classique vers le disque.
        const form = new FormData();
        form.set("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: form, signal: controller.signal });
        const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !data.url) throw new Error(data.error ?? `Erreur du serveur (${res.status}).`);
        url = data.url;
      }
      setClip((c) => (c ? { ...c, progress: 100, url } : c));
    } catch (e) {
      if (controller.signal.aborted) return;
      setClip((c) => (c ? { ...c, error: e instanceof Error ? e.message : "L'envoi du clip a échoué." } : c));
    }
  }

  async function onClip(file: File) {
    if (!CLIP_TYPES[file.type]) return setError("Vidéo non prise en charge : utilise un MP4, un MOV, un WebM ou un GIF.");
    if (file.size > MAX_CLIP_BYTES) return setError("Le clip est trop lourd (200 Mo maximum). Raccourcis-le.");
    try {
      const kind = file.type === "image/gif" ? "gif" : "video";
      const meta = kind === "gif" ? await gifFrame(file) : await clipFrame(file);
      setImage(null);
      setPreviewImage(meta.frame);
      setClip({
        name: file.name,
        kind,
        localUrl: URL.createObjectURL(file),
        width: meta.width,
        height: meta.height,
        duration: meta.duration,
        progress: 0,
        url: null,
        error: null,
      });
      void uploadClip(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cette vidéo n'a pas pu être lue.");
    }
  }

  async function onImage(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.type.startsWith("video/") || file.type === "image/gif") return onClip(file);
    uploadAbort.current?.abort();
    setClip(null);
    try {
      const resized = await resizeImage(file);
      setImage(resized);
      setPreviewImage(await resizeImage(resized, PREVIEW_IMAGE_SIDE));
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
    setMusic("");
    setYtChoice(null);
    setAudioTotal(null);
    setMusicFile(file);
    setMusicFileUrl(URL.createObjectURL(file));
    setExcerpt({ start: 0, length: 15 });
    setEditingExcerpt(true);
  }

  /** Extrait YouTube : déjà découpé côté serveur (il commence au début de la vidéo). */
  function onYoutubeExcerpt(file: File, choice: YoutubeChoice) {
    setError(null);
    setMusic("");
    setAudioTotal(null);
    setMusicFile(file);
    setMusicFileUrl(URL.createObjectURL(file));
    setYtChoice(choice);
    setEditingExcerpt(false);
  }

  function onLibraryMusic(name: string) {
    setMusicFile(null);
    setMusicFileUrl(null);
    setYtChoice(null);
    setAudioTotal(null);
    setMusic(name);
    setExcerpt({ start: 0, length: 15 });
    setEditingExcerpt(Boolean(name));
  }

  /** Retire le son : la vidéo sera muette. */
  function clearMusic() {
    onLibraryMusic("");
  }

  const ticker = useRef<number | undefined>(undefined);

  function stop() {
    window.clearInterval(ticker.current);
    audioRef.current?.pause();
    const clipVideo = clipVideoRef.current;
    if (clipVideo) {
      clipVideo.pause();
      clipVideo.currentTime = Math.min(0.5, clipVideo.duration || 0);
    }
    setPlaying(false);
    setPosition(0);
  }

  /** Lance le compteur de lecture ; `now` donne la position en secondes. */
  function startTicker(now: () => number, ended = () => false) {
    setPlaying(true);
    setPosition(0);
    window.clearInterval(ticker.current);
    ticker.current = window.setInterval(() => {
      const t = now();
      // Fin de la vidéo, ou fin du son plus tôt (la vidéo continue alors en silence).
      if (t >= duration || ended()) stop();
      else setPosition(t);
    }, 100);
  }

  // Changer de musique, de départ ou de durée arrête la lecture en cours.
  useEffect(() => stop, [audioSrc, start, duration]);

  /**
   * Joue la vidéo telle qu'elle sera : la musique depuis le départ choisi pendant la durée choisie,
   * avec l'aperçu et les fondus. Le déplacement attend le chargement (sinon iOS l'ignore).
   */
  function listen() {
    if (playing) return stop();
    // Le clip joue avec l'aperçu, en boucle et sans son (son propre son n'est pas gardé).
    const clipVideo = clipVideoRef.current;
    if (clipVideo) {
      clipVideo.currentTime = 0;
      void clipVideo.play().catch(() => {});
    }
    const audio = audioRef.current;
    if (!audio || !audioSrc) {
      // Pas de musique : vidéo muette, seul le temps défile.
      const t0 = performance.now();
      return startTicker(() => (performance.now() - t0) / 1000);
    }
    const play = () => {
      audio.currentTime = start;
      audio.play().then(
        () => startTicker(() => audio.currentTime - start, () => audio.ended),
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
    if (!image && !clip) return setError("Choisis une photo ou une vidéo.");
    if (clip && clip.error) return setError(`Le clip n'a pas été envoyé : ${clip.error} Choisis-le à nouveau.`);
    if (clip && !clip.url) return setError(`Envoi du clip en cours (${clip.progress} %) : attends la fin avant de créer la vidéo.`);
    setElapsed(0);
    setBusy(true);
    setVideo(null);
    setVideoBlob(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
    try {
      const form = new FormData();
      if (clip?.url) form.set("clipUrl", clip.url);
      else if (image) form.set("image", image, "image.jpg");
      form.set("text", text);
      form.set("title", title);
      if (templateId) form.set("templateId", templateId);
      form.set("start", String(start));
      form.set("duration", String(duration));
      if (musicFile) form.set("musicFile", musicFile);
      else if (music) form.set("music", music);
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
      {/* Aperçu fixe en haut : il reste visible pendant qu'on règle le texte, la template, la musique. */}
      <section
        aria-label="Aperçu"
        className="sticky top-14 z-[5] -mx-4 -mt-2 flex gap-3 border-b border-zinc-800 bg-background/95 px-4 py-3 backdrop-blur"
      >
        <div className="relative aspect-[9/16] w-32 shrink-0 overflow-hidden rounded-xl bg-zinc-900">
          {clip ? (
            // Clip ou GIF : fond de la template, clip cadré comme au rendu (même imageBox), calque texte.
            <div
              className="absolute inset-0 overflow-hidden transition-opacity duration-300"
              style={{
                backgroundColor: settings.backgroundColor,
                opacity: playing && (position < FADE || position > duration - FADE) ? 0.15 : 1,
              }}
            >
              {clip.kind === "gif" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={clip.localUrl} alt="" className="absolute object-cover" style={boxStyle(imageBox(settings, clip.width / clip.height))} />
              ) : (
                <video
                  ref={clipVideoRef}
                  // #t=0.5 : affiche une image du clip avant la lecture (sinon iOS montre un cadre noir).
                  src={`${clip.localUrl}#t=0.5`}
                  muted
                  loop
                  playsInline
                  preload="auto"
                  className="absolute object-cover"
                  style={boxStyle(imageBox(settings, clip.width / clip.height))}
                />
              )}
              {preview.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.url} alt="Aperçu de la vidéo" className="absolute inset-0 h-full w-full" />
              )}
            </div>
          ) : preview.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt="Aperçu de la vidéo"
              // Fondus d'entrée et de sortie, comme dans la vidéo, pendant la lecture.
              style={{ opacity: playing && (position < FADE || position > duration - FADE) ? 0.15 : 1 }}
              className={`h-full w-full object-cover transition-opacity duration-300 ${preview.loading ? "opacity-60" : ""}`}
            />
          )}
          {preview.loading && (
            <span className="absolute inset-x-0 top-1 text-center text-[10px] text-zinc-300">Mise à jour…</span>
          )}
          {preview.error && (
            <span className="absolute inset-x-1 top-1 rounded bg-red-950/90 px-1 py-1 text-center text-[10px] text-red-200">{preview.error}</span>
          )}
          {!image && !clip && (
            <label htmlFor="image" aria-label="Choisir une photo ou une vidéo" className="absolute inset-0 cursor-pointer" />
          )}
          {clip && (
            <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[10px] font-semibold">
              ▶ {clip.kind === "gif" ? "GIF" : "CLIP"}
            </span>
          )}
          {playing && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
              <div className="h-full bg-white" style={{ width: `${Math.min(100, (position / duration) * 100)}%` }} />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <p className="text-sm text-zinc-400">Aperçu exact de la vidéo</p>
          <label htmlFor="image" className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-zinc-800 font-semibold">
            {image || clip ? "Changer l'illustration" : "Photo ou vidéo"}
          </label>
          <button type="button" onClick={listen} className="min-h-12 rounded-xl bg-white font-semibold text-black disabled:opacity-50">
            {playing ? `■ ${formatTime(position)} / ${formatTime(duration)}` : "▶ Lire l'aperçu"}
          </button>
          <p className="truncate text-xs text-zinc-500">
            {hasAudio ? `🎵 ${ytChoice ? ytChoice.video.title : musicFile ? musicFile.name : labelFor(music)}` : "🔇 sans son"} · {duration} s
          </p>
          {clip && (
            <p className={`text-xs ${clip.error ? "text-red-300" : clip.url ? "text-green-400" : "text-sky-300"}`}>
              {clip.error
                ? `Envoi échoué : ${clip.error}`
                : clip.url
                  ? clip.kind === "gif"
                    ? "GIF envoyé ✓ (en boucle)"
                    : `Clip envoyé ✓ (${Math.round(clip.duration)} s${clip.duration < duration ? ", en boucle" : ""})`
                  : `Envoi du clip… ${clip.progress} %`}
            </p>
          )}
        </div>
        <input ref={imageInputRef} id="image" type="file" accept="image/*,video/mp4,video/quicktime,video/webm,image/gif" className="sr-only" onChange={(e) => onImage(e.target.files?.[0])} />
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
        {!hasAudio ? (
          <>
            <select id="music" value={music} onChange={(e) => onLibraryMusic(e.target.value)} className={input}>
              <option value="">Aucune (vidéo sans son)</option>
              {library.map((m) => (
                <option key={m} value={m}>{labelFor(m)}</option>
              ))}
            </select>
            <label className="cursor-pointer text-center text-sm text-sky-400 underline">
              ou envoyer un fichier audio (3 Mo max)
              <input type="file" accept="audio/*" className="sr-only" onChange={(e) => onMusicFile(e.target.files?.[0])} />
            </label>
            <YoutubePicker onPick={onYoutubeExcerpt} />
            <label className="flex flex-col gap-1">
              <span>Durée de la vidéo (sans son) : {silentDuration} s</span>
              <input type="range" min={MIN_DURATION} max={MAX_DURATION} step={1} value={silentDuration} onChange={(e) => setSilentDuration(Number(e.target.value))} className="h-10" />
            </label>
          </>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
            <div className="flex flex-col">
              <span className="truncate font-semibold">🎵 {ytChoice ? ytChoice.video.title : musicFile ? musicFile.name : labelFor(music)}</span>
              <span className="text-sm text-zinc-400">
                {ytChoice ? "YouTube" : musicFile ? "Fichier envoyé" : "Bibliothèque"} · extrait{" "}
                {formatTime(ytChoice ? ytChoice.excerpt.start : excerpt.start)} →{" "}
                {formatTime((ytChoice ? ytChoice.excerpt.start : excerpt.start) + duration)} · vidéo de {duration} s
              </span>
            </div>

            {editingExcerpt && !ytChoice && (
              <div className="flex flex-col gap-3 rounded-xl bg-zinc-950 p-3">
                <ExcerptFields key={audioSrc} value={excerpt} onChange={setExcerpt} />
                {audioTotal !== null && excerpt.start >= audioTotal && (
                  <p className="text-sm text-red-300">Le début dépasse la fin du son ({formatTime(audioTotal)}).</p>
                )}
                <button type="button" onClick={() => setEditingExcerpt(false)} className="min-h-11 rounded-xl bg-white font-semibold text-black">
                  OK
                </button>
              </div>
            )}
            {editingExcerpt && ytChoice && (
              <YoutubePicker initial={ytChoice} onPick={onYoutubeExcerpt} onClose={() => setEditingExcerpt(false)} />
            )}

            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={listen} className="min-h-11 rounded-xl bg-zinc-800 text-sm font-semibold">
                {playing ? "■ Arrêter" : "▶ Écouter"}
              </button>
              <button type="button" onClick={() => setEditingExcerpt((v) => !v)} className="min-h-11 rounded-xl bg-zinc-800 text-sm font-semibold">
                Modifier l&apos;extrait
              </button>
              <button type="button" onClick={clearMusic} className="min-h-11 rounded-xl bg-zinc-800 text-sm font-semibold">
                Changer de son
              </button>
            </div>
          </div>
        )}
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            setAudioTotal(Number.isFinite(d) ? d : null);
          }}
        />
      </section>

      {error && <p ref={errorRef} role="alert" className="rounded-xl bg-red-950 px-4 py-3 text-red-200">{error}</p>}

      <button type="button" onClick={create} disabled={busy} className={`${button} bg-white text-black`}>
        {busy ? `Création en cours… ${elapsed} s` : "Créer la vidéo"}
      </button>
      {busy && (
        <p className="-mt-3 text-center text-sm text-zinc-400">
          {clip ? "Avec un clip, compte à peu près la durée de la vidéo (jusqu'à 2-3 min)." : "Ça prend en général 5 à 20 secondes."}
        </p>
      )}

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
