"use client";

import { useEffect } from "react";

/** Enregistre public/sw.js (page « hors ligne ») ; seulement en production. */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error) => {
      console.error("Service worker non enregistré", error);
    });
  }, []);
  return null;
}
