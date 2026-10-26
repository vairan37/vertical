import type { MetadataRoute } from "next";

/** Installation sur l'écran d'accueil (PWA). Servi sans connexion : voir proxy.ts. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "vertical",
    short_name: "vertical",
    description: "Créer et publier des vidéos verticales sur Instagram et TikTok",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
