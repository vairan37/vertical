import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "./nav";

export const metadata: Metadata = {
  title: "vertical",
  description: "Créer et publier des vidéos verticales sur Instagram et TikTok",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Nav />
        {children}
      </body>
    </html>
  );
}
