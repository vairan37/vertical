import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // ffmpeg-static contient un binaire natif : il ne doit pas être bundlé.
  serverExternalPackages: ["ffmpeg-static"],
  // Fichiers lus à l'exécution, à embarquer dans les fonctions Vercel.
  outputFileTracingIncludes: {
    "/api/render": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./public/music/**/*.mp3",
      "./assets/fonts/**/*",
    ],
    "/api/music": ["./public/music/**/*.mp3"],
    "/api/templates/preview": ["./assets/fonts/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
