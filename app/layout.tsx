import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "./nav";
import ServiceWorker from "./service-worker";

export const metadata: Metadata = {
  title: "vertical",
  description: "Créer et publier des vidéos verticales sur Instagram et TikTok",
  // Écran d'accueil iPhone : plein écran, barre d'état noire, icône dédiée.
  appleWebApp: { capable: true, title: "vertical", statusBarStyle: "black" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ServiceWorker />
        <Nav />
        {children}
      </body>
    </html>
  );
}
