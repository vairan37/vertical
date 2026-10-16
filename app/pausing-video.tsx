"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";

/**
 * <video> qui se met en pause quand on ne la regarde plus. Avec cacheComponents, Next.js ne
 * démonte pas la page quittée : il la cache (React <Activity>, display: none), ce qui n'arrête
 * pas la lecture. Le nettoyage de useLayoutEffect s'exécute au masquage : on y met la pause
 * (la position est conservée). Même chose quand l'appli passe en arrière-plan.
 */
export default function PausingVideo(props: ComponentProps<"video">) {
  const ref = useRef<HTMLVideoElement>(null);
  useLayoutEffect(() => {
    const video = ref.current;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") video?.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      video?.pause();
    };
  }, []);
  return <video ref={ref} {...props} />;
}
